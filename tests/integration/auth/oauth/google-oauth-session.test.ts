
import { describe, expect, it, vi } from "vitest";

import { api, createApiAgent } from "../../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { prisma } from "../../../../src/config/db.js";
import { redis } from "../../../../src/config/redis.js";
import { googleOAuthClient } from "../../../../src/config/google-oauth.js";

import {
    verifyAccessToken,
    verifyRefreshToken,
} from "../../../../src/utils/jwt.js";

import { hashRefreshToken } from "../../../../src/utils/refreshToken.js";
import { googleTokenPayloadFixture } from "../../../fixtures/google.fixture.js";

const loginEndpoint = "/api/v1/auth/google";
const callbackEndpoint = "/api/v1/auth/google/callback";
const refreshEndpoint = "/api/v1/auth/refresh";
const logoutEndpoint = "/api/v1/auth/logout";
const meEndpoint = "/api/v1/auth/me";

const getRefreshCookie = (setCookie: string | string[]) => {
    const cookies = Array.isArray(setCookie)
        ? setCookie
        : [setCookie];

    const cookie = cookies.find((value) =>
        value?.startsWith("refreshToken=")
    );

    expect(cookie).toBeDefined();

    return cookie!;
};

const getRefreshToken = (cookie: string) =>
    cookie.split(";")[0]!.slice("refreshToken=".length);

const getRedisKey = (token: string) =>
    `refresh_token:${hashRefreshToken(token)}`;

const loginWithGoogle = async () => {
    const role = await prisma.role.create({
        data: {
            name: process.env.DEFAULT_USER_ROLE ?? "USER",
            permissions: {
                create: [
                    {
                        permission: {
                            create: { key: "product:read" },
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

    const authorizationResponse = await agent
        .get(loginEndpoint)
        .expect(302);

    const state = new URL(
        authorizationResponse.headers.location
    ).searchParams.get("state")!;

    const response = await agent
        .get(callbackEndpoint)
        .query({ code: "valid-code", state })
        .expect(200);

    const user = await prisma.user.findUniqueOrThrow({
        where: { email: googleTokenPayloadFixture.email },
    });

    const accessToken = response.body.data.accessToken as string;

    const refreshCookie = getRefreshCookie(
        response.headers["set-cookie"]
    );

    const refreshToken = getRefreshToken(refreshCookie);

    return {
        agent,
        role,
        user,
        response,
        accessToken,
        refreshCookie,
        refreshToken,
    };
};

describe("Google OAuth Session Lifecycle", () => {
    setupIntegrationTests();

    it("should issue a valid application JWT with correct claims", async () => {
        const { user, role, accessToken, response } =
            await loginWithGoogle();

        const payload = verifyAccessToken(accessToken);

        expect(payload).toMatchObject({
            userId: user.id,
            roleId: role.id,
            role: role.name,
            permissions: ["product:read"],
            roleVersion: role.authVersion,
            userVersion: user.authVersion,
        });

        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");

        const { iat, exp } = payload as typeof payload & {
            iat: number;
            exp: number;
        };

        expect(exp).toBeGreaterThan(iat);

        expect(response.body.data).not.toHaveProperty(
            "refreshToken"
        );
    });

    it("should issue the refresh token through a secure HttpOnly cookie", async () => {
        const { refreshCookie, refreshToken } =
            await loginWithGoogle();

        expect(refreshCookie).toContain("HttpOnly");
        expect(refreshCookie).toContain("SameSite=Strict");
        expect(refreshCookie).toContain("Path=/");

        expect(refreshCookie).toContain(
            `Max-Age=${process.env.JWT_REFRESH_EXPIRES_IN_SECONDS}`
        );

        if (process.env.NODE_ENV === "production") {
            expect(refreshCookie).toContain("Secure");
        } else {
            expect(refreshCookie).not.toMatch(/; Secure(?:;|$)/);
        }

        expect(refreshToken).toEqual(expect.any(String));

        const payload = verifyRefreshToken(refreshToken);

        expect(payload).toHaveProperty("jti");
        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");
    });

    it("should persist only the hashed refresh token in Redis", async () => {
        const { user, refreshToken } = await loginWithGoogle();

        const redisKey = getRedisKey(refreshToken);

        expect(await redis.get(redisKey)).toBe(user.id);

        // Raw refresh tokens must never be used as Redis keys.
        expect(
            await redis.exists(`refresh_token:${refreshToken}`)
        ).toBe(0);

        const ttl = await redis.ttl(redisKey);

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(
            Number(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS)
        );

        const payload = verifyRefreshToken(refreshToken);

        expect(payload.userId).toBe(user.id);
    });

    it("should access /auth/me using a Google-authenticated JWT", async () => {
        const { user, role, accessToken } =
            await loginWithGoogle();

        const response = await api
            .get(meEndpoint)
            .set("Authorization", `Bearer ${accessToken}`)
            .expect(200);

        expect(response.body.data).toMatchObject({
            id: user.id,
            email: googleTokenPayloadFixture.email,
            name: googleTokenPayloadFixture.name,
            role: role.name,
            permissions: ["product:read"],
        });

        expect(response.body.data).not.toHaveProperty("password");
        expect(response.body.data).not.toHaveProperty("authVersion");
        expect(response.body.data).not.toHaveProperty("oauthAccounts");
    });

    it("should rotate refresh tokens and reject replay of the previous token", async () => {
        const { agent, user, refreshToken: oldToken } =
            await loginWithGoogle();

        const oldRedisKey = getRedisKey(oldToken);

        expect(await redis.get(oldRedisKey)).toBe(user.id);

        const response = await agent
            .post(refreshEndpoint)
            .expect(200);

        const newToken = getRefreshToken(
            getRefreshCookie(response.headers["set-cookie"])
        );

        expect(newToken).not.toBe(oldToken);

        expect(verifyRefreshToken(newToken).userId)
            .toBe(user.id);

        expect(
            verifyAccessToken(
                response.body.data.accessToken
            ).userId
        ).toBe(user.id);

        // Old token must be consumed.
        expect(await redis.exists(oldRedisKey)).toBe(0);

        // New token must be persisted.
        expect(
            await redis.get(getRedisKey(newToken))
        ).toBe(user.id);

        // Replay the old token explicitly.
        const replayResponse = await api
            .post(refreshEndpoint)
            .set("Cookie", `refreshToken=${oldToken}`)
            .expect(401);

        expect(replayResponse.body.message).toBe(
            "Invalid or expired refresh token"
        );

        // A rejected replay must not destroy the valid session.
        expect(
            await redis.get(getRedisKey(newToken))
        ).toBe(user.id);
    });

    it("should invalidate the OAuth refresh session on logout", async () => {
        const { agent, user, refreshToken } =
            await loginWithGoogle();

        const redisKey = getRedisKey(refreshToken);

        expect(await redis.get(redisKey)).toBe(user.id);

        const logoutResponse = await agent
            .post(logoutEndpoint)
            .expect(204);

        expect(logoutResponse.text).toBe("");

        // Session must be revoked in Redis.
        expect(await redis.exists(redisKey)).toBe(0);

        const clearedCookie = getRefreshCookie(
            logoutResponse.headers["set-cookie"]
        );

        expect(clearedCookie).toMatch(
            /Max-Age=0|Expires=Thu, 01 Jan 1970/
        );

        expect(getRefreshToken(clearedCookie)).toBe("");

        // Reusing the revoked token must fail.
        const replayResponse = await api
            .post(refreshEndpoint)
            .set("Cookie", `refreshToken=${refreshToken}`)
            .expect(401);

        expect(replayResponse.body.message).toBe(
            "Invalid or expired refresh token"
        );

        // Cookie-based refresh must also fail after logout.
        const refreshResponse = await agent
            .post(refreshEndpoint)
            .expect(401);

        expect(refreshResponse.body.message).toBe(
            "Refresh token is required"
        );
    });
});
