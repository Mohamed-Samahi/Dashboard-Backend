import { describe, expect, it } from "vitest";

import { api, createApiAgent } from "../../helpers/api.helper.js";
import { createTestUser } from "../../factories/user.factory.js";
import { setupIntegrationTests } from "../../setup/integration.js";

import { redis } from "../../../src/config/redis.js";
import { hashRefreshToken } from "../../../src/utils/refreshToken.js";

const loginEndpoint = "/api/v1/auth/login";
const logoutEndpoint = "/api/v1/auth/logout";
const refreshEndpoint = "/api/v1/auth/refresh";

describe("POST /api/v1/auth/logout", () => {
    setupIntegrationTests();

    const extractRefreshCookie = (
        setCookie: string | string[]
    ) => {
        const cookies = Array.isArray(setCookie)
            ? setCookie
            : [setCookie];

        const cookie = cookies.find((value) =>
            value.startsWith("refreshToken=")
        );

        expect(cookie).toBeDefined();

        return cookie!;
    };

    const getRedisKey = (token: string) =>
        `refresh_token:${hashRefreshToken(token)}`;

    const login = async () => {
        const agent = createApiAgent();
        const { user, plainPassword } = await createTestUser();

        const response = await agent
            .post(loginEndpoint)
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        const cookie = extractRefreshCookie(
            response.headers["set-cookie"]
        );

        const refreshToken = cookie
            .split(";")[0]!
            .slice("refreshToken=".length);

        return { agent, user, refreshToken };
    };

    it("should logout successfully with status 204", async () => {
        const { agent } = await login();

        const response = await agent
            .post(logoutEndpoint)
            .expect(204);

        expect(response.text).toBe("");
    });

    it("should clear the refresh-token cookie", async () => {
        const { agent } = await login();

        const response = await agent
            .post(logoutEndpoint)
            .expect(204);

        const cookie = extractRefreshCookie(
            response.headers["set-cookie"]
        );

        expect(cookie).toContain("refreshToken=");
        expect(cookie).toContain("HttpOnly");
        expect(cookie).toContain("SameSite=Strict");
        expect(cookie).toContain("Path=/");
        expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

        const cookieValue = cookie.split(";")[0];

        expect(cookieValue).toBe("refreshToken=");

        if (process.env.NODE_ENV === "production") {
            expect(cookie).toContain("Secure");
        } else {
            expect(cookie).not.toMatch(/; Secure(?:;|$)/);
        }
    });

    it("should revoke the refresh token in Redis", async () => {
        const { agent, user, refreshToken } = await login();

        const redisKey = getRedisKey(refreshToken);

        expect(await redis.get(redisKey)).toBe(user.id);

        await agent.post(logoutEndpoint).expect(204);

        expect(await redis.exists(redisKey)).toBe(0);
    });

    it("should reject a revoked refresh token after logout", async () => {
        const { agent, refreshToken } = await login();

        await agent.post(logoutEndpoint).expect(204);

        // Manually replay the old token.
        const response = await api
            .post(refreshEndpoint)
            .set("Cookie", `refreshToken=${refreshToken}`)
            .expect(401);

        expect(response.body).toMatchObject({
            status: "error",
            message: "Invalid or expired refresh token",
        });
    });

    it("should prevent refresh requests after the cookie is cleared", async () => {
        const { agent } = await login();

        await agent.post(logoutEndpoint).expect(204);

        const response = await agent
            .post(refreshEndpoint)
            .expect(401);

        expect(response.body.message).toBe(
            "Refresh token is required"
        );
    });

    it("should allow logout without an existing session", async () => {
        const response = await api
            .post(logoutEndpoint)
            .expect(204);

        expect(response.text).toBe("");

        const cookie = extractRefreshCookie(
            response.headers["set-cookie"]
        );

        expect(cookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);
    });

    it("should make repeated logout requests safe", async () => {
        const { agent, refreshToken } = await login();

        await agent.post(logoutEndpoint).expect(204);

        // Replay the original cookie on a second logout.
        await api
            .post(logoutEndpoint)
            .set("Cookie", `refreshToken=${refreshToken}`)
            .expect(204);

        expect(
            await redis.exists(getRedisKey(refreshToken))
        ).toBe(0);
    });
});
