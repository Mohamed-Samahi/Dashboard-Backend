
import { describe, expect, it, vi } from "vitest";

import { api, createApiAgent } from "../../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { prisma } from "../../../../src/config/db.js";
import { redis } from "../../../../src/config/redis.js";
import { googleOAuthClient } from "../../../../src/config/google-oauth.js";

import { verifyAccessToken } from "../../../../src/utils/jwt.js";
import { updateRole, assignUserRole } from "../../../../src/features/rbac/rbac.service.js";

import { googleTokenPayloadFixture } from "../../../fixtures/google.fixture.js";

const authEndpoint = "/api/v1/auth/google";
const callbackEndpoint = "/api/v1/auth/google/callback";
const usersEndpoint = "/api/v1/rbac/users";
const meEndpoint = "/api/v1/auth/me";

const createRole = async (
    name: string,
    permissions: string[] = []
) => {
    return prisma.role.create({
        data: {
            name,
            permissions: {
                create: permissions.map((key) => ({
                    permission: {
                        connectOrCreate: {
                            where: { key },
                            create: { key },
                        },
                    },
                })),
            },
        },
    });
};

const loginWithGoogle = async () => {
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
        .get(authEndpoint)
        .expect(302);

    const state = new URL(
        authResponse.headers.location
    ).searchParams.get("state")!;

    const response = await agent
        .get(callbackEndpoint)
        .query({ code: "valid-code", state })
        .expect(200);

    const user = await prisma.user.findUniqueOrThrow({
        where: { email: googleTokenPayloadFixture.email },
    });

    return {
        agent,
        user,
        accessToken: response.body.data.accessToken as string,
    };
};

const bearer = (token: string) => ({
    Authorization: `Bearer ${token}`,
});

describe("Google OAuth RBAC and Authentication Regression", () => {
    setupIntegrationTests();

    it("should assign database role and permissions to Google users", async () => {
        const roleName = process.env.DEFAULT_USER_ROLE!;

        const role = await createRole(roleName, [
            "user:read",
            "product:read",
        ]);

        const { user, accessToken } = await loginWithGoogle();

        const storedUser = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
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

        expect(storedUser.roleId).toBe(role.id);
        expect(storedUser.role.name).toBe(roleName);

        const permissions = storedUser.role.permissions.map(
            ({ permission }) => permission.key
        );

        expect(permissions).toEqual(
            expect.arrayContaining([
                "user:read",
                "product:read",
            ])
        );
        expect(permissions).toHaveLength(2);

        const payload = verifyAccessToken(accessToken);

        expect(payload.roleId).toBe(role.id);
        expect(payload.permissions).toEqual(
            expect.arrayContaining(permissions)
        );
        expect(payload.permissions).toHaveLength(2);
    });

    it("should enforce permissions on RBAC-protected endpoints", async () => {
        await createRole(process.env.DEFAULT_USER_ROLE!);

        const { accessToken, user } = await loginWithGoogle();

        // No permission: access denied.
        const denied = await api
            .get(usersEndpoint)
            .set(bearer(accessToken))
            .expect(403);

        expect(denied.body.message).toBe("Forbidden");

        // Grant permission through the actual RBAC service.
        await prisma.permission.create({
            data: { key: "user:read" },
        });

        await updateRole(user.roleId, {
            permissions: ["user:read"],
        });

        // Previously issued token must be invalidated.
        const revoked = await api
            .get(usersEndpoint)
            .set(bearer(accessToken))
            .expect(401);

        expect(revoked.body.message).toBe(
            "Invalid or revoked token"
        );

        // Refresh the session to receive updated permissions.
        // This uses the real refresh token cookie.
        // A separate agent login is needed because the helper
        // above does not return the original agent here.
        const { agent: freshAgent } = await loginWithGoogle();

        const refreshed = await freshAgent
            .post("/api/v1/auth/refresh")
            .expect(200);

        const newToken = refreshed.body.data.accessToken;

        const allowed = await api
            .get(usersEndpoint)
            .set(bearer(newToken))
            .expect(200);

        expect(allowed.body.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: user.id }),
            ])
        );
    });

    it("should invalidate Google JWTs after role changes and user reassignment", async () => {
        const defaultRole = await createRole(
            process.env.DEFAULT_USER_ROLE!,
            ["user:read"]
        );

        const { user, agent, accessToken } =
            await loginWithGoogle();

        await api
            .get(meEndpoint)
            .set(bearer(accessToken))
            .expect(200);

        // Change the role's permissions using the RBAC service.
        await prisma.permission.create({
            data: { key: "product:create" },
        });

        await updateRole(defaultRole.id, {
            permissions: ["product:create"],
        });

        expect(
            await redis.get(
                `auth:role:${defaultRole.id}:version`
            )
        ).toBe("2");

        await api
            .get(meEndpoint)
            .set(bearer(accessToken))
            .expect(401);

        const refreshed = await agent
            .post("/api/v1/auth/refresh")
            .expect(200);

        const updatedToken = refreshed.body.data.accessToken;
        const updatedPayload = verifyAccessToken(updatedToken);

        expect(updatedPayload.permissions).toEqual([
            "product:create",
        ]);
        expect(updatedPayload.roleVersion).toBe(2);

        await api
            .get(meEndpoint)
            .set(bearer(updatedToken))
            .expect(200);

        // Reassign the user to a different role.
        const newRole = await createRole("EMPLOYEE", [
            "user:read",
        ]);

        await assignUserRole(user.id, newRole.id);

        expect(
            await redis.get(`auth:user:${user.id}:version`)
        ).toBe("2");

        await api
            .get(meEndpoint)
            .set(bearer(updatedToken))
            .expect(401);

        const secondRefresh = await agent
            .post("/api/v1/auth/refresh")
            .expect(200);

        const finalPayload = verifyAccessToken(
            secondRefresh.body.data.accessToken
        );

        expect(finalPayload.roleId).toBe(newRole.id);
        expect(finalPayload.role).toBe("EMPLOYEE");
        expect(finalPayload.permissions).toEqual([
            "user:read",
        ]);
        expect(finalPayload.userVersion).toBe(2);
    });

    it("should preserve email/password registration, login, refresh and logout", async () => {
        await createRole(process.env.DEFAULT_USER_ROLE!);

        const agent = createApiAgent();

        const credentials = {
            name: "Password User",
            email: "password-user@example.com",
            password: "TestPassword123!",
        };

        const registerResponse = await agent
            .post("/api/v1/auth/register")
            .send(credentials)
            .expect(201);

        const userId = registerResponse.body.data.id;

        const loginResponse = await agent
            .post("/api/v1/auth/login")
            .send({
                email: credentials.email,
                password: credentials.password,
            })
            .expect(200);

        expect(
            verifyAccessToken(
                loginResponse.body.data.accessToken
            ).userId
        ).toBe(userId);

        const refreshResponse = await agent
            .post("/api/v1/auth/refresh")
            .expect(200);

        expect(
            verifyAccessToken(
                refreshResponse.body.data.accessToken
            ).userId
        ).toBe(userId);

        await agent
            .post("/api/v1/auth/logout")
            .expect(204);

        await agent
            .post("/api/v1/auth/refresh")
            .expect(401);

        const user = await prisma.user.findUniqueOrThrow({
            where: { id: userId },
        });

        expect(user.password).not.toBeNull();
        expect(await prisma.oAuthAccount.count()).toBe(0);
    });

    it("should reject password authentication for OAuth-only users", async () => {
        await createRole(process.env.DEFAULT_USER_ROLE!);

        const { user } = await loginWithGoogle();

        expect(user.password).toBeNull();

        const response = await api
            .post("/api/v1/auth/login")
            .send({
                email: user.email,
                password: "AnyPassword123!",
            })
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid credentials"
        );

        expect(response.body.data?.accessToken).toBeUndefined();

        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(1);

        const account = await prisma.oAuthAccount.findFirstOrThrow();

        expect(account.userId).toBe(user.id);

        // Google authentication must remain functional.
        const { user: returningUser } = await loginWithGoogle();

        expect(returningUser.id).toBe(user.id);
        expect(await prisma.user.count()).toBe(1);
    });
});
