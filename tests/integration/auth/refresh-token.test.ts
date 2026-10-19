import { describe, expect, it } from "vitest";

import { api } from "../../helpers/api.helper.js";
import { createTestUser } from "../../factories/user.factory.js";
import { setupIntegrationTests } from "../../setup/integration.js";

import { redis } from "../../../src/config/redis.js";
import { hashRefreshToken } from "../../../src/utils/refreshToken.js";
import { verifyRefreshToken } from "../../../src/utils/jwt.js";

const endpoint = "/api/v1/auth/login";

describe("Refresh Token Cookie & Redis Persistence", () => {
    setupIntegrationTests();

    const login = async () => {
        const { user, plainPassword } = await createTestUser();

        const response = await api
            .post(endpoint)
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        const setCookie = response.headers["set-cookie"];

        expect(setCookie).toBeDefined();

        const cookies = Array.isArray(setCookie)
            ? setCookie
            : [setCookie];

        const refreshCookie = cookies.find((cookie: string) =>
            cookie.startsWith("refreshToken=")
        );

        expect(refreshCookie).toBeDefined();

        const refreshToken = refreshCookie!
            .split(";")[0]!
            .slice("refreshToken=".length);

        return { user, response, refreshCookie: refreshCookie!, refreshToken };
    };

    it("should set the correct refresh-token cookie attributes", async () => {
        const { refreshCookie } = await login();

        expect(refreshCookie).toContain("HttpOnly");
        expect(refreshCookie).toContain("SameSite=Strict");
        expect(refreshCookie).toContain("Path=/");

        if (process.env.NODE_ENV === "production") {
            expect(refreshCookie).toContain("Secure");
        } else {
            expect(refreshCookie).not.toMatch(/; Secure(?:;|$)/);
        }

        const expectedMaxAge = Number(
            process.env.JWT_REFRESH_EXPIRES_IN_SECONDS
        );

        expect(refreshCookie).toContain(
            `Max-Age=${expectedMaxAge}`
        );
    });

    it("should store the hashed refresh token in Redis", async () => {
        const { user, refreshToken } = await login();

        const tokenHash = hashRefreshToken(refreshToken);
        const redisKey = `refresh_token:${tokenHash}`;

        const storedUserId = await redis.get(redisKey);

        expect(storedUserId).toBe(user.id);

        // The raw token must not be stored as the Redis key.
        expect(await redis.exists(`refresh_token:${refreshToken}`))
            .toBe(0);
    });

    it("should set Redis expiration for the refresh token", async () => {
        const { refreshToken } = await login();

        const redisKey = `refresh_token:${hashRefreshToken(refreshToken)}`;

        const ttl = await redis.ttl(redisKey);

        const expectedTTL = Number(
            process.env.JWT_REFRESH_EXPIRES_IN_SECONDS
        );

        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(expectedTTL);
    });

    it("should issue a refresh token with the correct JWT payload", async () => {
        const { user, refreshToken } = await login();

        const payload = verifyRefreshToken(refreshToken);

        expect(payload.userId).toBe(user.id);
        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");

        const { iat, exp } = payload as typeof payload & {
            iat: number;
            exp: number;
        };

        expect(exp - iat).toBe(
            Number(process.env.JWT_REFRESH_EXPIRES_IN_SECONDS)
        );
    });

    it("should not expose the refresh token in the response body", async () => {
        const { response } = await login();

        expect(response.body.data).toHaveProperty("accessToken");
        expect(response.body.data).not.toHaveProperty("refreshToken");
    });
});