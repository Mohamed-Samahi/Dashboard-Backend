import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { api, createApiAgent } from "../../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { prisma } from "../../../../src/config/db.js";
import { redis } from "../../../../src/config/redis.js";
import { googleOAuthClient } from "../../../../src/config/google-oauth.js";

import { googleTokenPayloadFixture } from "../../../fixtures/google.fixture.js";

import { GaxiosError } from "gaxios";

const endpoint = "/api/v1/auth/google/callback";
const loginEndpoint = "/api/v1/auth/google";

describe("GET /api/v1/auth/google/callback", () => {
    setupIntegrationTests();

    it("should authenticate a user with a valid Google callback", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        vi.spyOn(googleOAuthClient, "getToken").mockResolvedValue({
            tokens: {
                id_token: "mock-google-id-token",
            },
            res: null,
        } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken").mockResolvedValue({
            getPayload: () => googleTokenPayloadFixture,
        } as never);

        await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        const response = await agent
            .get(endpoint)
            .query({
                code: "valid-authorization-code",
                state,
            })
            .expect(200);

        expect(response.body.message).toBe(
            "Google authentication successful"
        );

        expect(response.body.data.accessToken).toEqual(
            expect.any(String)
        );
    });

    it("should reject a callback with missing state", async () => {
        const response = await api
            .get(endpoint)
            .query({ code: "test-code" })
            .expect(400);

        expect(response.body.message).toBe(
            "Invalid Google OAuth state"
        );
    });

    it("should reject a callback with mismatched state", async () => {
        const agent = createApiAgent();

        await agent.get(loginEndpoint).expect(302);

        const response = await agent
            .get(endpoint)
            .query({
                code: "test-code",
                state: "invalid-state",
            })
            .expect(400);

        expect(response.body.message).toBe(
            "Invalid OAuth state"
        );
    });

    it("should reject a callback without the state cookie", async () => {
        const authResponse = await api
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await api
            .get(endpoint)
            .query({
                code: "test-code",
                state,
            })
            .expect(400);

        expect(response.body.message).toBe(
            "Invalid OAuth state"
        );
    });

    it("should reject an expired OAuth state", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        await redis.del(`oauth:google:state:${hashedState}`);

        const response = await agent
            .get(endpoint)
            .query({
                code: "test-code",
                state,
            })
            .expect(400);

        expect(response.body.message).toBe(
            "OAuth state expired or already used"
        );
    });

    it("should reject a previously consumed OAuth state", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        const redisKey = `oauth:google:state:${hashedState}`;

        const callback = () =>
            agent.get(endpoint).query({ state });

        // First callback consumes the valid state.
        const firstResponse = await callback().expect(400);

        expect(firstResponse.body.message).toBe(
            "Google authorization code is missing"
        );

        // Verify that Redis state was consumed.
        expect(await redis.exists(redisKey)).toBe(0);

        // Second callback is rejected because the state cookie was cleared.
        const response = await callback().expect(400);

        expect(response.body.message).toBe(
            "Invalid OAuth state"
        );
    });

    it("should prevent concurrent reuse of the same OAuth state", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const cookies = authResponse.headers["set-cookie"];
        const stateCookie = (
            Array.isArray(cookies) ? cookies : [cookies]
        ).find((cookie) => cookie?.startsWith("google_oauth_state="))!;

        // Explicitly reuse the original cookie for both requests.
        const sendCallback = () =>
            api
                .get(endpoint)
                .set("Cookie", stateCookie.split(";")[0]!)
                .query({ state });

        const responses = await Promise.all([
            sendCallback(),
            sendCallback(),
        ]);

        const messages = responses.map(
            (response) => response.body.message
        );

        expect(responses.map((response) => response.status)).toEqual([
            400,
            400,
        ]);

        // Exactly one request passed state validation.
        expect(messages).toContain(
            "Google authorization code is missing"
        );

        // The other request was rejected by Redis.
        expect(messages).toContain(
            "OAuth state expired or already used"
        );

        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        expect(
            await redis.exists(`oauth:google:state:${hashedState}`)
        ).toBe(0);
    });

    it("should reject Google authentication cancellation", async () => {
        const agent = createApiAgent();

        const authResponse = await agent.get(loginEndpoint).expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await agent
            .get(endpoint)
            .query({ state, error: "access_denied" })
            .expect(400);

        expect(response.body.message).toBe(
            "Google authentication cancelled"
        );
    });

    it("should reject other Google provider errors", async () => {
        const agent = createApiAgent();

        const authResponse = await agent.get(loginEndpoint).expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await agent
            .get(endpoint)
            .query({ state, error: "server_error" })
            .expect(400);

        expect(response.body.message).toBe(
            "Google authentication failed"
        );
    });

    it("should reject a missing authorization code without creating a session", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await agent
            .get(endpoint)
            .query({ state })
            .expect(400);

        expect(response.body.message).toBe(
            "Google authorization code is missing"
        );

        // No application session must be created.
        expect(response.body.data?.accessToken).toBeUndefined();

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        expect(
            cookieList.some((cookie) =>
                cookie?.startsWith("refreshToken=")
            )
        ).toBe(false);

        // No user or OAuth account should be created.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No active refresh session should exist in Redis.
        const refreshKeys = await redis.keys("refresh_token:*");
        expect(refreshKeys).toHaveLength(0);

        // OAuth state must have been consumed despite the failure.
        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        expect(
            await redis.exists(`oauth:google:state:${hashedState}`)
        ).toBe(0);
    });

    it.each([
        ["invalid", "invalid-code"],
        ["expired", "expired-code"],
    ])("should reject %s Google authorization codes", async (_, code) => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const url = new URL("https://oauth2.googleapis.com/token");

        const config = {
            url,
            method: "POST",
            headers: new Headers(),
        };

        const googleResponse = new Response(
            JSON.stringify({ error: "invalid_grant" }),
            {
                status: 400,
                statusText: "Bad Request",
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        // Consume the body before constructing the GaxiosError.
        const data = await googleResponse.json();

        const googleError = new GaxiosError(
            "invalid_grant",
            config,
            Object.assign(googleResponse, { config, data })
        );

        const getTokenSpy = vi
            .spyOn(googleOAuthClient, "getToken")
            .mockRejectedValue(googleError);

        const response = await agent
            .get(endpoint)
            .query({ code, state })
            .expect(400);

        expect(getTokenSpy).toHaveBeenCalledTimes(1);
        expect(getTokenSpy).toHaveBeenCalledWith(code);

        expect(response.body.message).toBe(
            "Google authorization code is invalid or expired"
        );

        expect(response.body.data?.accessToken).toBeUndefined();

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        expect(
            cookieList.some((cookie) =>
                cookie?.startsWith("refreshToken=")
            )
        ).toBe(false);

        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        expect(await redis.keys("refresh_token:*")).toHaveLength(0);

        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        expect(
            await redis.exists(`oauth:google:state:${hashedState}`)
        ).toBe(0);
    });

    it("should reject replay of a previously used authorization code", async () => {
        const agent = createApiAgent();
        const code = "single-use-google-code";

        // Google accepts the code only once.
        let codeExchanges = 0;

        const getTokenSpy = vi
            .spyOn(googleOAuthClient, "getToken")
            .mockImplementation(async () => {
                codeExchanges++;

                if (codeExchanges > 1) {
                    const url = new URL("https://oauth2.googleapis.com/token");

                    const config = {
                        url,
                        method: "POST",
                        headers: new Headers(),
                    };

                    const googleResponse = new Response(
                        JSON.stringify({ error: "invalid_grant" }),
                        {
                            status: 400,
                            statusText: "Bad Request",
                            headers: {
                                "Content-Type": "application/json",
                            },
                        }
                    );

                    const data = await googleResponse.json();

                    throw new GaxiosError(
                        "invalid_grant",
                        config,
                        Object.assign(googleResponse, { config, data })
                    );
                }

                return {
                    tokens: { id_token: "mock-google-id-token" },
                } as never;
            });

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => googleTokenPayloadFixture,
            } as never);

        await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        const startOAuth = async () => {
            const response = await agent.get(loginEndpoint).expect(302);

            return new URL(response.headers.location)
                .searchParams.get("state")!;
        };

        // First authentication succeeds.
        const firstState = await startOAuth();

        const firstResponse = await agent
            .get(endpoint)
            .query({ code, state: firstState })
            .expect(200);

        expect(firstResponse.body.data.accessToken)
            .toEqual(expect.any(String));

        // A new OAuth flow attempts to replay the same code.
        const secondState = await startOAuth();

        const secondResponse = await agent
            .get(endpoint)
            .query({ code, state: secondState });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body.message).toBe(
            "Google authorization code is invalid or expired"
        );

        expect(getTokenSpy).toHaveBeenCalledTimes(2);

        // No duplicate accounts should be created.
        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(1);
    });

    it("should reject Google response without an ID token", async () => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        // Google accepts the code but returns no ID token.
        const getTokenSpy = vi
            .spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: {
                    access_token: "mock-google-access-token",
                },
            } as never);

        const verifySpy = vi.spyOn(
            googleOAuthClient,
            "verifyIdToken"
        );

        const response = await agent
            .get(endpoint)
            .query({
                code: "valid-code-without-id-token",
                state,
            })
            .expect(401);

        expect(response.body.message).toBe(
            "Google ID token is missing"
        );

        expect(getTokenSpy).toHaveBeenCalledTimes(1);
        expect(verifySpy).not.toHaveBeenCalled();

        // No application JWT or refresh cookie.
        expect(response.body.data?.accessToken).toBeUndefined();

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        expect(
            cookieList.some((cookie) =>
                cookie?.startsWith("refreshToken=")
            )
        ).toBe(false);

        // No user or OAuth account created.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No refresh session stored in Redis.
        expect(await redis.keys("refresh_token:*")).toHaveLength(0);

        // OAuth state must be consumed.
        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        const redisKey = `oauth:google:state:${hashedState}`;

        expect(await redis.exists(redisKey)).toBe(0);

        // Replaying the same state and original cookie must fail.
        const originalCookies = authResponse.headers["set-cookie"];
        const originalCookieList = Array.isArray(originalCookies)
            ? originalCookies
            : [originalCookies];

        const stateCookie = originalCookieList.find(
            (cookie) => cookie?.startsWith("google_oauth_state=")
        );

        expect(stateCookie).toBeDefined();

        const replayResponse = await api
            .get(endpoint)
            .set("Cookie", stateCookie!.split(";")[0]!)
            .query({
                code: "valid-code-without-id-token",
                state,
            })
            .expect(400);

        expect(replayResponse.body.message).toBe(
            "OAuth state expired or already used"
        );

        expect(getTokenSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["missing Google user ID", { sub: undefined }],
        ["missing email", { email: undefined }],
        ["unverified email", { email_verified: false }],
        ["missing email verification claim", { email_verified: undefined }],
    ])("should reject Google identity with %s", async (_, overrides) => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const getTokenSpy = vi
            .spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "mock-google-id-token" },
            } as never);

        const verifySpy = vi
            .spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => ({
                    ...googleTokenPayloadFixture,
                    ...overrides,
                }),
            } as never);

        const response = await agent
            .get(endpoint)
            .query({ code: "valid-code", state })
            .expect(401);

        expect(response.body.message).toBe(
            "Google account identity is invalid or email is not verified"
        );

        expect(getTokenSpy).toHaveBeenCalledOnce();
        expect(verifySpy).toHaveBeenCalledOnce();

        // No application access token or refresh cookie.
        expect(response.body.data?.accessToken).toBeUndefined();

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        expect(
            cookieList.some((cookie) =>
                cookie?.startsWith("refreshToken=")
            )
        ).toBe(false);

        // No database account created.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No application session persisted.
        expect(await redis.keys("refresh_token:*")).toHaveLength(0);

        // OAuth state must be consumed.
        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        expect(
            await redis.exists(`oauth:google:state:${hashedState}`)
        ).toBe(0);
    });

    it("should clear OAuth state cookie after successful callback", async () => {
        const agent = createApiAgent();

        const authResponse = await agent.get(loginEndpoint).expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        vi.spyOn(googleOAuthClient, "getToken").mockResolvedValue({
            tokens: { id_token: "mock-google-id-token" },
        } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken").mockResolvedValue({
            getPayload: () => googleTokenPayloadFixture,
        } as never);

        await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        const response = await agent
            .get(endpoint)
            .query({ code: "valid-code", state })
            .expect(200);

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        const clearedCookie = cookieList.find((cookie) =>
            cookie?.startsWith("google_oauth_state=")
        );

        expect(clearedCookie).toBeDefined();
        expect(clearedCookie).toContain("google_oauth_state=;");
        expect(clearedCookie).toContain(
            "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        );
        expect(clearedCookie).toContain(
            "Path=/api/v1/auth/google/callback"
        );
        expect(clearedCookie).toContain("HttpOnly");
        expect(clearedCookie).toContain("SameSite=Lax");
    });

    it("should clear OAuth state cookie after failed callback", async () => {
        const agent = createApiAgent();

        const authResponse = await agent.get(loginEndpoint).expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const response = await agent
            .get(endpoint)
            .query({
                code: "invalid-code",
                state: "tampered-" + state,
            })
            .expect(400);

        expect(response.body.message).toBe("Invalid OAuth state");

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        const clearedCookie = cookieList.find((cookie) =>
            cookie?.startsWith("google_oauth_state=")
        );

        expect(clearedCookie).toBeDefined();
        expect(clearedCookie).toContain("google_oauth_state=;");
        expect(clearedCookie).toContain(
            "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        );
        expect(clearedCookie).toContain(
            "Path=/api/v1/auth/google/callback"
        );
        expect(clearedCookie).toContain("HttpOnly");
        expect(clearedCookie).toContain("SameSite=Lax");
    });

    it.each([
        ["empty Google user ID", { sub: "" }],
        ["empty email", { email: "" }],
        ["numeric Google user ID", { sub: 12345 }],
        ["numeric email", { email: 12345 }],
        ["malformed email", { email: "not-an-email" }],
        ["object email", { email: { malicious: true } }],
    ])("should reject malformed Google identity with %s", async (_, overrides) => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        vi.spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "mock-google-id-token" },
            } as never);

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => ({
                    ...googleTokenPayloadFixture,
                    ...overrides,
                }),
            } as never);

        await agent
            .get(endpoint)
            .query({ code: "valid-code", state })
            .expect(401);

        // No account must be created for malformed identity data.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No application session must be created.
        expect(await redis.keys("refresh_token:*")).toHaveLength(0);
    });

    it.each([
        ["expired token", "Token used too late"],
        ["invalid signature", "Invalid token signature"],
        ["incorrect audience", "Wrong recipient, payload audience != requiredAudience"],
        ["forged issuer", "Invalid issuer"],
    ])("should reject Google ID token with %s", async (_, errorMessage) => {
        const agent = createApiAgent();

        const authResponse = await agent
            .get(loginEndpoint)
            .expect(302);

        const state = new URL(
            authResponse.headers.location
        ).searchParams.get("state")!;

        const getTokenSpy = vi
            .spyOn(googleOAuthClient, "getToken")
            .mockResolvedValue({
                tokens: { id_token: "invalid-google-id-token" },
            } as never);

        const verifySpy = vi
            .spyOn(googleOAuthClient, "verifyIdToken")
            .mockRejectedValue(new Error(errorMessage));

        const response = await agent
            .get(endpoint)
            .query({ code: "valid-code", state });

        // Authentication must fail.
        expect(response.status).toBe(401);
        expect(response.body.message).toBe("Invalid Google ID token");

        expect(getTokenSpy).toHaveBeenCalledOnce();
        expect(verifySpy).toHaveBeenCalledOnce();

        expect(verifySpy).toHaveBeenCalledWith({
            idToken: "invalid-google-id-token",
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        // No application JWT or refresh cookie.
        expect(response.body.data?.accessToken).toBeUndefined();

        const cookies = response.headers["set-cookie"];
        const cookieList = Array.isArray(cookies) ? cookies : [cookies];

        expect(
            cookieList.some((cookie) =>
                cookie?.startsWith("refreshToken=")
            )
        ).toBe(false);

        // No database records created.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No application session stored.
        expect(await redis.keys("refresh_token:*")).toHaveLength(0);

        // OAuth state must be consumed.
        const hashedState = createHash("sha256")
            .update(state)
            .digest("hex");

        expect(
            await redis.exists(`oauth:google:state:${hashedState}`)
        ).toBe(0);
    });
});