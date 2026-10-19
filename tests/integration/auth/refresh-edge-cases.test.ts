import { describe, expect, it } from "vitest";

import { api } from "../../helpers/api.helper.js";
import { createTestUser } from "../../factories/user.factory.js";
import { setupIntegrationTests } from "../../setup/integration.js";

import { redis } from "../../../src/config/redis.js";
import { hashRefreshToken } from "../../../src/utils/refreshToken.js";
import { verifyRefreshToken } from "../../../src/utils/jwt.js";

const loginEndpoint = "/api/v1/auth/login";
const refreshEndpoint = "/api/v1/auth/refresh";

describe("Refresh Token Edge Cases", () => {
    setupIntegrationTests();

    const login = async () => {
        const { user, plainPassword } = await createTestUser();

        const response = await api
            .post(loginEndpoint)
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        const setCookie = response.headers["set-cookie"];

        const cookies: string[] = Array.isArray(setCookie)
            ? setCookie
            : setCookie
                ? [setCookie]
                : [];

        const refreshCookie = cookies.find((cookie) =>
            cookie.startsWith("refreshToken=")
        );

        expect(refreshCookie).toBeDefined();

        const refreshToken = refreshCookie!
            .split(";")[0]!
            .slice("refreshToken=".length);

        return { user, refreshToken };
    };

    const getRedisKey = (token: string) =>
        `refresh_token:${hashRefreshToken(token)}`;

    it("should reject an expired Redis session even if the JWT is valid", async () => {
        const { refreshToken } = await login();

        const redisKey = getRedisKey(refreshToken);

        // JWT is still cryptographically valid.
        expect(verifyRefreshToken(refreshToken)).toHaveProperty(
            "userId"
        );

        // Simulate Redis session expiration.
        await redis.pExpire(redisKey, 1);

        // Wait until Redis expires the key.
        await new Promise((resolve) => setTimeout(resolve, 30));

        expect(await redis.exists(redisKey)).toBe(0);

        // The JWT itself has not expired.
        expect(verifyRefreshToken(refreshToken)).toHaveProperty(
            "userId"
        );

        const response = await api
            .post(refreshEndpoint)
            .set("Cookie", `refreshToken=${refreshToken}`)
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or expired refresh token"
        );
    });

    it("should allow only one concurrent refresh request to succeed", async () => {
        const { refreshToken } = await login();

        const sendRefreshRequest = () =>
            api
                .post(refreshEndpoint)
                .set("Cookie", `refreshToken=${refreshToken}`);

        // Both requests use the same refresh token.
        const responses = await Promise.all([
            sendRefreshRequest(),
            sendRefreshRequest(),
        ]);

        const statuses = responses
            .map((response) => response.status)
            .sort();

        // Exactly one successful refresh, one rejected reuse.
        expect(statuses).toEqual([200, 401]);

        const successfulResponse = responses.find(
            (response) => response.status === 200
        );

        const rejectedResponse = responses.find(
            (response) => response.status === 401
        );

        expect(
            successfulResponse?.body.data.accessToken
        ).toEqual(expect.any(String));

        expect(rejectedResponse?.body.message).toBe(
            "Invalid or expired refresh token"
        );

        // Original token must be invalidated.
        expect(
            await redis.exists(getRedisKey(refreshToken))
        ).toBe(0);
    });
});
