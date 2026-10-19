import { describe, expect, it } from "vitest";

import { createApiAgent } from "../../helpers/api.helper.js";
import { createTestUser } from "../../factories/user.factory.js";
import { setupIntegrationTests } from "../../setup/integration.js";

import { redis } from "../../../src/config/redis.js";
import { hashRefreshToken } from "../../../src/utils/refreshToken.js";
import { verifyRefreshToken } from "../../../src/utils/jwt.js";

const loginEndpoint = "/api/v1/auth/login";
const refreshEndpoint = "/api/v1/auth/refresh";

import request from "supertest";
import app from "../../../src/app.js";

describe("Refresh Token Rotation", () => {
    setupIntegrationTests();

    const extractRefreshToken = (
        setCookie: string | string[]
    ) => {
        const cookies = Array.isArray(setCookie)
            ? setCookie
            : [setCookie];

        const refreshCookie = cookies.find((cookie) =>
            cookie.startsWith("refreshToken=")
        );

        expect(refreshCookie).toBeDefined();

        return refreshCookie!
            .split(";")[0]!
            .slice("refreshToken=".length);
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

        const refreshToken = extractRefreshToken(
            response.headers["set-cookie"]
        );

        return { agent, user, refreshToken };
    };

    it("should issue a new refresh token on rotation", async () => {
        const { agent, user, refreshToken: oldToken } =
            await login();

        const response = await agent
            .post(refreshEndpoint)
            .expect(200);

        const newToken = extractRefreshToken(
            response.headers["set-cookie"]
        );

        expect(newToken).not.toBe(oldToken);

        expect(verifyRefreshToken(newToken).userId).toBe(user.id);

        expect(response.body.data.accessToken).toEqual(
            expect.any(String)
        );
    });

    it("should invalidate the previous refresh token in Redis", async () => {
        const { agent, user, refreshToken: oldToken } =
            await login();

        expect(await redis.get(getRedisKey(oldToken))).toBe(
            user.id
        );

        const response = await agent
            .post(refreshEndpoint)
            .expect(200);

        const newToken = extractRefreshToken(
            response.headers["set-cookie"]
        );

        // Previous session token must be revoked.
        expect(await redis.exists(getRedisKey(oldToken))).toBe(0);

        // Replacement token must be persisted.
        expect(await redis.get(getRedisKey(newToken))).toBe(
            user.id
        );
    });

    it("should reject reuse of an already rotated token", async () => {
        const { agent, refreshToken: oldToken } =
            await login();

        await agent.post(refreshEndpoint).expect(200);

        // Explicitly submit the old cookie instead of the
        // automatically updated cookie in the agent.
        // Use a stateless client to explicitly replay the old token.
        const response = await request(app)
            .post(refreshEndpoint)
            .set("Cookie", `refreshToken=${oldToken}`)
            .expect(401);

        expect(response.body).toMatchObject({
            status: "error",
            message: "Invalid or expired refresh token",
        });
    });

    it("should support consecutive refresh token rotations", async () => {
        const { agent, user, refreshToken: firstToken } =
            await login();

        const firstResponse = await agent
            .post(refreshEndpoint)
            .expect(200);

        const secondToken = extractRefreshToken(
            firstResponse.headers["set-cookie"]
        );

        const secondResponse = await agent
            .post(refreshEndpoint)
            .expect(200);

        const thirdToken = extractRefreshToken(
            secondResponse.headers["set-cookie"]
        );

        expect(new Set([
            firstToken,
            secondToken,
            thirdToken,
        ]).size).toBe(3);

        expect(await redis.exists(getRedisKey(firstToken)))
            .toBe(0);

        expect(await redis.exists(getRedisKey(secondToken)))
            .toBe(0);

        expect(await redis.get(getRedisKey(thirdToken)))
            .toBe(user.id);
    });

    it("should reject a refresh token that is absent from Redis", async () => {
        const { agent, refreshToken } = await login();

        // Simulate a revoked or expired Redis session.
        await redis.del(getRedisKey(refreshToken));

        const response = await agent
            .post(refreshEndpoint)
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or expired refresh token"
        );
    });
});
