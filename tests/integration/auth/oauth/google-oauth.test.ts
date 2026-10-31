import { describe, expect, it, vi } from "vitest";

import { api } from "../../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { createHash } from "node:crypto";
import { redis } from "../../../../src/config/redis.js";

const endpoint = "/api/v1/auth/google";

describe("GET /api/v1/auth/google", () => {
    setupIntegrationTests();

    it("should redirect to Google OAuth authorization endpoint", async () => {
        const response = await api
            .get(endpoint)
            .expect(302);

        const location = response.headers.location;

        expect(location).toEqual(expect.any(String));

        const url = new URL(location);

        expect(url.origin).toBe("https://accounts.google.com");
        expect(url.pathname).toBe("/o/oauth2/v2/auth");

        expect(url.searchParams.get("client_id")).toBe(
            process.env.GOOGLE_CLIENT_ID
        );

        expect(url.searchParams.get("redirect_uri")).toBe(
            process.env.GOOGLE_CALLBACK_URL
        );

        expect(url.searchParams.get("response_type")).toBe("code");

        expect(url.searchParams.get("state")).toMatch(
            /^[a-f0-9]{64}$/
        );
    });

    it("should request the required Google OAuth scopes", async () => {
        const response = await api.get(endpoint).expect(302);

        const url = new URL(response.headers.location);

        const scopes = url.searchParams.get("scope")?.split(" ");

        expect(scopes).toEqual(
            expect.arrayContaining(["openid", "email", "profile"])
        );

        expect(scopes).toHaveLength(3);
    });

    it("should generate a unique OAuth state for each request", async () => {
        const firstResponse = await api.get(endpoint).expect(302);
        const secondResponse = await api.get(endpoint).expect(302);

        const firstUrl = new URL(firstResponse.headers.location);
        const secondUrl = new URL(secondResponse.headers.location);

        const firstState = firstUrl.searchParams.get("state");
        const secondState = secondUrl.searchParams.get("state");

        expect(firstState).toMatch(/^[a-f0-9]{64}$/);
        expect(secondState).toMatch(/^[a-f0-9]{64}$/);

        expect(firstState).not.toBe(secondState);
    });

    it("should store OAuth state in Redis with a 5-minute TTL", async () => {
        const response = await api.get(endpoint).expect(302);

        const url = new URL(response.headers.location);
        const state = url.searchParams.get("state")!;

        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        const redisKey = `oauth:google:state:${hashedState}`;

        const storedValue = await redis.get(redisKey);
        const ttl = await redis.ttl(redisKey);

        expect(storedValue).toBe("pending");
        expect(ttl).toBeGreaterThan(0);
        expect(ttl).toBeLessThanOrEqual(300);
    });

    it("should set a secure OAuth state cookie", async () => {
        const response = await api.get(endpoint).expect(302);

        const cookies = response.headers["set-cookie"];

        const stateCookie = (
            Array.isArray(cookies) ? cookies : [cookies]
        ).find((cookie) => cookie?.startsWith("google_oauth_state="));

        expect(stateCookie).toBeDefined();

        const url = new URL(response.headers.location);
        const state = url.searchParams.get("state");

        expect(stateCookie).toContain(`google_oauth_state=${state}`);
        expect(stateCookie).toContain("HttpOnly");
        expect(stateCookie).toContain("SameSite=Lax");
        expect(stateCookie).toContain("Max-Age=300");
        expect(stateCookie).toContain("Path=/api/v1/auth/google/callback");
    });
});
