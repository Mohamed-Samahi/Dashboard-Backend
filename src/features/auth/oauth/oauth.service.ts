import { prisma } from "../../../config/db.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../../errors/AppError.js";

import type { GoogleIdentity } from "./google.service.js";

import { createUserSession } from "../auth.tokens.js";

const findOrCreateOAuthUser = async (identity: GoogleIdentity) => {
    const accountWhere = {
        provider_providerAccountId: {
            provider: identity.provider,
            providerAccountId: identity.providerAccountId,
        },
    };

    const userInclude = {
        role: {
            include: {
                permissions: {
                    include: {
                        permission: true,
                    },
                },
            },
        },
    } as const;

    try {
        return await prisma.$transaction(async (tx) => {
            // 1. Lock this provider identity for the transaction.
            // Concurrent logins for the same identity are serialized.
            const identityKey =
                `${identity.provider}:${identity.providerAccountId}`;

            await tx.$queryRaw`
                SELECT 1 AS acquired
                FROM (
                    SELECT pg_advisory_xact_lock(
                        hashtextextended(${identityKey}, 0)
                    )
                ) AS lock_guard
            `;

            // 2. Check for an existing linked OAuth account.
            const existingAccount = await tx.oAuthAccount.findUnique({
                where: accountWhere,
                include: {
                    user: {
                        include: userInclude,
                    },
                },
            });

            if (existingAccount) {
                return existingAccount.user;
            }

            // 3. Prevent automatic linking by email.
            const existingUser = await tx.user.findUnique({
                where: { email: identity.email },
            });

            if (existingUser) {
                throw new AppError(
                    "Account already exists. Account linking is required.",
                    409
                );
            }

            // 4. Resolve the default application role.
            const defaultRoleName = process.env.DEFAULT_USER_ROLE;

            if (!defaultRoleName) {
                throw new Error("DEFAULT_USER_ROLE is not defined");
            }

            const defaultRole = await tx.role.findUnique({
                where: { name: defaultRoleName },
            });

            if (!defaultRole) {
                throw new AppError(
                    "Default role is not configured",
                    500
                );
            }

            // 5. Atomically create the user and OAuth identity.
            return tx.user.create({
                data: {
                    email: identity.email,
                    name: identity.name,
                    password: null,
                    roleId: defaultRole.id,
                    oauthAccounts: {
                        create: {
                            provider: identity.provider,
                            providerAccountId: identity.providerAccountId,
                        },
                    },
                },
                include: userInclude,
            });
        });
    } catch (error) {
        // 6. Additional protection against unique constraint races.
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const account = await prisma.oAuthAccount.findUnique({
                where: accountWhere,
                include: {
                    user: {
                        include: userInclude,
                    },
                },
            });

            if (account) {
                return account.user;
            }

            throw new AppError(
                "Account already exists. Account linking is required.",
                409
            );
        }

        throw error;
    }
};

const authenticateOAuthUser = async (
    identity: GoogleIdentity
) => {
    const user = await findOrCreateOAuthUser(identity);

    return createUserSession(user);
};

export {
    findOrCreateOAuthUser,
    authenticateOAuthUser
};