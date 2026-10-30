import { prisma } from "../../../config/db.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { AppError } from "../../../errors/AppError.js";

import type { GoogleIdentity } from "./google.service.js";

import { createUserSession } from "../auth.tokens.js";

const findOrCreateOAuthUser = async (identity: GoogleIdentity) => {
    try {
        // 1. Find existing OAuth account
        const existingAccount = await prisma.oAuthAccount.findUnique({
            where: {
                provider_providerAccountId: {
                    provider: identity.provider,
                    providerAccountId: identity.providerAccountId,
                },
            },
            include: {
                user: {
                    include: {
                        role: {
                            include: {
                                permissions: {
                                    include: {
                                        permission: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (existingAccount) {
            return existingAccount.user;
        }

        // 2. Create new user and OAuth account atomically
        return await prisma.$transaction(async (tx) => {
            const existingUser = await tx.user.findUnique({
                where: { email: identity.email },
            });

            if (existingUser) {
                throw new AppError(
                    "Account already exists. Account linking is required.",
                    409
                );
            }

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
                include: {
                    role: {
                        include: {
                            permissions: {
                                include: {
                                    permission: true,
                                },
                            },
                        },
                    },
                },
            });
        });
    } catch (error) {
        // 3. Handle concurrent account creation
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const account = await prisma.oAuthAccount.findUnique({
                where: {
                    provider_providerAccountId: {
                        provider: identity.provider,
                        providerAccountId: identity.providerAccountId,
                    },
                },
                include: {
                    user: {
                        include: {
                            role: {
                                include: {
                                    permissions: {
                                        include: {
                                            permission: true,
                                        },
                                    },
                                },
                            },
                        },
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