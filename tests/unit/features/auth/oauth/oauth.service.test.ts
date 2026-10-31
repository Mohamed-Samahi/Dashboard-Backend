
import { beforeEach, describe, expect, it, vi } from "vitest";

import { googleIdentityFixture } from "../../../../fixtures/google.fixture.js";

import { prisma } from "../../../../../src/config/db.js";
import {
    authenticateOAuthUser,
    findOrCreateOAuthUser,
} from "../../../../../src/features/auth/oauth/oauth.service.js";

import { createUserSession } from "../../../../../src/features/auth/auth.tokens.js";

// Mock the exact modules imported by the OAuth service.
vi.mock("../../../../../src/config/db.js", () => ({
    prisma: {
        $transaction: vi.fn(),
        oAuthAccount: {
            findUnique: vi.fn(),
        },
    },
}));

vi.mock("../../../../../src/features/auth/auth.tokens.js", () => ({
    createUserSession: vi.fn(),
}));

const identity = googleIdentityFixture;

const user = {
    id: "test-user-id",
    email: identity.email,
    password: null,
    authVersion: 1,
};

const tx = {
    $queryRaw: vi.fn(),
    oAuthAccount: {
        findUnique: vi.fn(),
    },
    user: {
        findUnique: vi.fn(),
        create: vi.fn(),
    },
    role: {
        findUnique: vi.fn(),
    },
};

beforeEach(() => {
    vi.resetAllMocks();

    vi.mocked(prisma.$transaction).mockImplementation(
        (async (callback: unknown) => {
            return (
                callback as (client: typeof tx) => Promise<unknown>
            )(tx);
        }) as never
    );

    tx.$queryRaw.mockResolvedValue([{ acquired: 1 }]);
    tx.oAuthAccount.findUnique.mockResolvedValue(null);
    tx.user.findUnique.mockResolvedValue(null);
    tx.user.create.mockResolvedValue(user);

    tx.role.findUnique.mockResolvedValue({
        id: "default-role-id",
        name: "USER",
    });
});

describe("OAuth Account Service", () => {
    it("should return an existing linked OAuth user", async () => {
        tx.oAuthAccount.findUnique.mockResolvedValue({ user });

        const result = await findOrCreateOAuthUser(identity);

        expect(result).toEqual(user);

        expect(tx.oAuthAccount.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    provider_providerAccountId: {
                        provider: identity.provider,
                        providerAccountId: identity.providerAccountId,
                    },
                },
            })
        );

        expect(tx.user.create).not.toHaveBeenCalled();
    });

    it("should reject an existing unlinked email account", async () => {
        tx.user.findUnique.mockResolvedValue(user);

        await expect(
            findOrCreateOAuthUser(identity)
        ).rejects.toMatchObject({
            message:
                "Account already exists. Account linking is required.",
            statusCode: 409,
        });

        expect(tx.user.create).not.toHaveBeenCalled();
    });

    it("should reject a missing default role", async () => {
        tx.role.findUnique.mockResolvedValue(null);

        await expect(
            findOrCreateOAuthUser(identity)
        ).rejects.toMatchObject({
            message: "Default role is not configured",
            statusCode: 500,
        });

        expect(tx.user.create).not.toHaveBeenCalled();
    });

    it("should create a user and OAuth account atomically", async () => {
        const result = await findOrCreateOAuthUser(identity);

        expect(result).toEqual(user);
        expect(tx.$queryRaw).toHaveBeenCalledOnce();

        expect(tx.user.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    email: identity.email,
                    name: identity.name,
                    password: null,
                    roleId: "default-role-id",
                    oauthAccounts: {
                        create: {
                            provider: identity.provider,
                            providerAccountId:
                                identity.providerAccountId,
                        },
                    },
                },
            })
        );
    });

    it("should create an application session for the resolved user", async () => {
        tx.oAuthAccount.findUnique.mockResolvedValue({ user });

        vi.mocked(createUserSession).mockResolvedValue({
            accessToken: "app-access-token",
            refreshToken: "app-refresh-token",
        });

        const result = await authenticateOAuthUser(identity);

        expect(createUserSession).toHaveBeenCalledExactlyOnceWith(user);

        expect(result).toEqual({
            accessToken: "app-access-token",
            refreshToken: "app-refresh-token",
        });
    });
});
