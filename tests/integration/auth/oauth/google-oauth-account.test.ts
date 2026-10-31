
import { describe, expect, it, vi } from "vitest";

import { createApiAgent } from "../../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { prisma } from "../../../../src/config/db.js";
import { googleOAuthClient } from "../../../../src/config/google-oauth.js";
import { googleTokenPayloadFixture } from "../../../fixtures/google.fixture.js";

import { verifyAccessToken } from "../../../../src/utils/jwt.js";

const loginEndpoint = "/api/v1/auth/google";
const callbackEndpoint = "/api/v1/auth/google/callback";

describe("Google OAuth Account Persistence", () => {
    setupIntegrationTests();

    it("should create a new user with a linked OAuth account and null password", async () => {
        const agent = createApiAgent();

        const role = await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        vi.spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "mock-google-id-token" },
            } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => googleTokenPayloadFixture,
            } as never);

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        await agent
            .get(callbackEndpoint)
            .query({ code: "valid-code", state })
            .expect(200);

        const users = await prisma.user.findMany({
            include: { oauthAccounts: true },
        });

        expect(users).toHaveLength(1);

        const user = users[0]!;

        expect(user).toMatchObject({
            email: googleTokenPayloadFixture.email,
            name: googleTokenPayloadFixture.name,
            password: null,
            roleId: role.id,
        });

        expect(user.oauthAccounts).toHaveLength(1);

        expect(user.oauthAccounts[0]).toMatchObject({
            provider: "google",
            providerAccountId: googleTokenPayloadFixture.sub,
            userId: user.id,
        });

        expect(await prisma.oAuthAccount.count()).toBe(1);
    });

    it("should assign the configured default role and permissions to a new OAuth user", async () => {
        const roleName = process.env.DEFAULT_USER_ROLE!;

        const role = await prisma.role.create({
            data: {
                name: roleName,
                permissions: {
                    create: [
                        {
                            permission: {
                                create: { key: "product:read" },
                            },
                        },
                        {
                            permission: {
                                create: { key: "order:read" },
                            },
                        },
                    ],
                },
            },
        });

        vi.spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "mock-google-id-token" },
            } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => googleTokenPayloadFixture,
            } as never);

        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await agent
            .get(callbackEndpoint)
            .query({ code: "valid-code", state })
            .expect(200);

        const user = await prisma.user.findUnique({
            where: { email: googleTokenPayloadFixture.email },
            include: {
                role: {
                    include: {
                        permissions: {
                            include: { permission: true },
                        },
                    },
                },
            },
        });

        expect(user).not.toBeNull();
        expect(user!.roleId).toBe(role.id);
        expect(user!.role.name).toBe(roleName);

        const expectedPermissions = ["product:read", "order:read"];

        expect(
            user!.role.permissions.map(({ permission }) => permission.key)
        ).toEqual(expect.arrayContaining(expectedPermissions));

        const payload = verifyAccessToken(
            response.body.data.accessToken
        );

        expect(payload).toMatchObject({
            userId: user!.id,
            roleId: role.id,
            role: roleName,
            permissions: expect.arrayContaining(expectedPermissions),
            roleVersion: role.authVersion,
            userVersion: user!.authVersion,
        });

        expect(payload.permissions).toHaveLength(2);
    });

    it("should authenticate a returning Google user without creating duplicates", async () => {
        const role = await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        vi.spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "mock-google-id-token" },
            } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => googleTokenPayloadFixture,
            } as never);

        const loginWithGoogle = async () => {
            const agent = createApiAgent();

            const authResponse = await agent
                .get(loginEndpoint)
                .expect(302);

            const state = new URL(
                authResponse.headers.location
            ).searchParams.get("state")!;

            return agent
                .get(callbackEndpoint)
                .query({ code: "valid-code", state })
                .expect(200);
        };

        // First login creates the user.
        const firstResponse = await loginWithGoogle();

        const firstUser = await prisma.user.findUniqueOrThrow({
            where: { email: googleTokenPayloadFixture.email },
        });

        // Second login must reuse the existing account.
        const secondResponse = await loginWithGoogle();

        const users = await prisma.user.findMany({
            include: { oauthAccounts: true },
        });

        expect(users).toHaveLength(1);
        expect(users[0]!.id).toBe(firstUser.id);
        expect(users[0]!.roleId).toBe(role.id);

        expect(users[0]!.oauthAccounts).toHaveLength(1);
        expect(users[0]!.oauthAccounts[0]).toMatchObject({
            provider: "google",
            providerAccountId: googleTokenPayloadFixture.sub,
            userId: firstUser.id,
        });

        expect(await prisma.oAuthAccount.count()).toBe(1);

        // Both logins must issue valid application access tokens.
        for (const response of [firstResponse, secondResponse]) {
            const payload = verifyAccessToken(
                response.body.data.accessToken
            );

            expect(payload.userId).toBe(firstUser.id);
            expect(payload.roleId).toBe(role.id);
        }
    });
});
