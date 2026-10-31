import { afterEach, describe, expect, it, vi } from "vitest";

import { googleOAuthClient } from "../../../../../src/config/google-oauth.js";

import {
    generateGoogleAuthUrl,
    getGoogleIdentity,
    verifyGoogleIdToken

} from "../../../../../src/features/auth/oauth/google.service.js";

import { googleTokenPayloadFixture } from "../../../../fixtures/google.fixture.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("Google OAuth Service", () => {
    it("should generate a valid authorization URL with a unique state", () => {
        const first = generateGoogleAuthUrl();
        const second = generateGoogleAuthUrl();

        expect(first.state).toMatch(/^[a-f0-9]{64}$/);
        expect(second.state).not.toBe(first.state);

        const url = new URL(first.url);

        expect(url.searchParams.get("state")).toBe(first.state);
        expect(url.searchParams.get("client_id")).toBe(
            process.env.GOOGLE_CLIENT_ID
        );

        expect(
            url.searchParams.get("scope")?.split(" ")
        ).toEqual(
            expect.arrayContaining(["openid", "email", "profile"])
        );
    });

    it("should verify Google ID tokens against the configured audience", async () => {
        const verifySpy = vi.spyOn(
            googleOAuthClient,
            "verifyIdToken"
        ).mockResolvedValue({
            getPayload: () => googleTokenPayloadFixture,
        } as never);

        const payload = await verifyGoogleIdToken("test-id-token");

        expect(payload).toEqual(googleTokenPayloadFixture);
        expect(verifySpy).toHaveBeenCalledExactlyOnceWith({
            idToken: "test-id-token",
            audience: process.env.GOOGLE_CLIENT_ID,
        });
    });

    it("should reject a missing verified token payload", async () => {
        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => undefined,
            } as never);

        await expect(
            verifyGoogleIdToken("test-id-token")
        ).rejects.toMatchObject({
            message: "Invalid Google ID token",
            statusCode: 401,
        });
    });

    it("should reject a failed Google token verification", async () => {
        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockRejectedValue(
                new Error("Invalid token signature")
            );

        await expect(
            verifyGoogleIdToken("forged-token")
        ).rejects.toMatchObject({
            message: "Invalid Google ID token",
            statusCode: 401,
        });
    });

    it("should extract identity from a verified Google token", async () => {
        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => googleTokenPayloadFixture,
            } as never);

        await expect(
            getGoogleIdentity("valid-id-token")
        ).resolves.toEqual({
            provider: "google",
            providerAccountId: googleTokenPayloadFixture.sub,
            email: googleTokenPayloadFixture.email,
            name: googleTokenPayloadFixture.name,
        });
    });

    it.each([
        ["missing subject", { sub: undefined }],
        ["numeric subject", { sub: 12345 }],
        ["missing email", { email: undefined }],
        ["invalid email", { email: "invalid-email" }],
        ["unverified email", { email_verified: false }],
        ["missing verification", { email_verified: undefined }],
        ["object email", { email: { value: "invalid" } }],
    ])("should reject identity with %s", async (_, changes) => {
        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => ({
                    ...googleTokenPayloadFixture,
                    ...changes,
                }),
            } as never);

        await expect(
            getGoogleIdentity("test-id-token")
        ).rejects.toMatchObject({
            message:
                "Google account identity is invalid or email is not verified",
            statusCode: 401,
        });
    });
});
