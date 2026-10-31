import { prisma } from "../../src/config/db.js";
import { googleIdentityFixture } from "../fixtures/google.fixture.js";

import type { GoogleIdentity } from "../../src/features/auth/oauth/google.service.js";

const createOAuthTestUser = async (
    identity: GoogleIdentity = googleIdentityFixture
) => {
    const roleName = process.env.DEFAULT_USER_ROLE ?? "USER";

    const role = await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
    });

    const user = await prisma.user.create({
        data: {
            email: identity.email,
            name: identity.name,
            password: null,
            roleId: role.id,
            oauthAccounts: {
                create: {
                    provider: identity.provider,
                    providerAccountId: identity.providerAccountId,
                },
            },
        },
        include: {
            role: true,
            oauthAccounts: true,
        },
    });

    return user;
};

export { createOAuthTestUser };
