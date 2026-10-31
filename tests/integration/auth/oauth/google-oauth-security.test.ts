
import {
    describe,
    expect,
    it,
    vi,
    beforeAll,
    afterAll,
} from "vitest";

import request from "supertest";
import app from "../../../../src/app.js";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createTestUser } from "../../../factories/user.factory.js";
import { setupIntegrationTests } from "../../../setup/integration.js";

import { prisma } from "../../../../src/config/db.js";
import { redis } from "../../../../src/config/redis.js";
import { googleOAuthClient } from "../../../../src/config/google-oauth.js";
import { verifyAccessToken } from "../../../../src/utils/jwt.js";

import { googleTokenPayloadFixture } from "../../../fixtures/google.fixture.js";

const loginEndpoint = "/api/v1/auth/google";
const callbackEndpoint = "/api/v1/auth/google/callback";

type GooglePayload = typeof googleTokenPayloadFixture;

let server: Server;
let baseUrl: string;

const mockGoogle = (payload: GooglePayload) => {
    vi.spyOn(googleOAuthClient, "getToken")
        .mockResolvedValue({
            tokens: { id_token: "mock-google-id-token" },
        } as never);

    vi.spyOn(googleOAuthClient, "verifyIdToken")
        .mockResolvedValue({
            getPayload: () => payload,
        } as never);
};

const createDefaultRole = async () => {
    return prisma.role.create({
        data: {
            name: process.env.DEFAULT_USER_ROLE ?? "USER",
        },
    });
};

const startOAuth = async () => {
    const response = await request(baseUrl)
        .get(loginEndpoint)
        .expect(302);

    const state = new URL(
        response.headers.location
    ).searchParams.get("state")!;

    const cookies = response.headers["set-cookie"];
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];

    const cookie = cookieList.find(
        (value) => value?.startsWith("google_oauth_state=")
    );

    expect(cookie).toBeDefined();

    return {
        state,
        cookie: cookie!.split(";")[0]!,
    };
};

const completeOAuth = async (
    flow: Awaited<ReturnType<typeof startOAuth>>
) => {
    return request(baseUrl)
        .get(callbackEndpoint)
        .set("Cookie", flow.cookie)
        .query({
            code: "valid-test-code",
            state: flow.state,
        });
};

const expectNoSession = async (
    response: Awaited<ReturnType<typeof completeOAuth>>
) => {
    expect(response.body.data?.accessToken).toBeUndefined();

    const cookies = response.headers["set-cookie"];
    const cookieList = Array.isArray(cookies) ? cookies : [cookies];

    expect(
        cookieList.some((cookie) =>
            cookie?.startsWith("refreshToken=")
        )
    ).toBe(false);

    expect(await redis.keys("refresh_token:*")).toHaveLength(0);
};

describe("Google OAuth Account Security", () => {
    setupIntegrationTests();

    beforeAll(async () => {
        server = app.listen(0, "127.0.0.1");

        await new Promise<void>((resolve, reject) => {
            if (server.listening) {
                resolve();
                return;
            }

            server.once("listening", resolve);
            server.once("error", reject);
        });

        const address = server.address() as AddressInfo;

        baseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    });

    it("should reject an existing unlinked email/password account", async () => {
        const { user } = await createTestUser({
            email: googleTokenPayloadFixture.email,
        });

        mockGoogle(googleTokenPayloadFixture);

        const response = await completeOAuth(await startOAuth());

        expect(response.status).toBe(409);
        expect(response.body.message).toBe(
            "Account already exists. Account linking is required."
        );

        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        const unchanged = await prisma.user.findUniqueOrThrow({
            where: { id: user.id },
        });

        expect(unchanged.password).toBe(user.password);
        expect(unchanged.roleId).toBe(user.roleId);

        await expectNoSession(response);
    });

    it("should identify returning users by provider account ID, not email", async () => {
        await createDefaultRole();
        mockGoogle(googleTokenPayloadFixture);

        const firstResponse = await completeOAuth(await startOAuth());

        expect(firstResponse.status).toBe(200);

        const originalUser = await prisma.user.findUniqueOrThrow({
            where: { email: googleTokenPayloadFixture.email },
        });

        // Same verified Google subject, changed email.
        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => ({
                    ...googleTokenPayloadFixture,
                    email: "updated-google@example.com",
                }),
            } as never);

        const secondResponse = await completeOAuth(await startOAuth());

        expect(secondResponse.status).toBe(200);

        const token = verifyAccessToken(
            secondResponse.body.data.accessToken
        );

        expect(token.userId).toBe(originalUser.id);
        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(1);

        // Existing stored email is unchanged.
        const unchanged = await prisma.user.findUniqueOrThrow({
            where: { id: originalUser.id },
        });

        expect(unchanged.email).toBe(googleTokenPayloadFixture.email);
    });

    it("should reject a different Google subject claiming an existing email", async () => {
        await createDefaultRole();
        mockGoogle(googleTokenPayloadFixture);

        expect(
            (await completeOAuth(await startOAuth())).status
        ).toBe(200);

        const original = await prisma.user.findUniqueOrThrow({
            where: { email: googleTokenPayloadFixture.email },
        });

        vi.spyOn(googleOAuthClient, "verifyIdToken")
            .mockResolvedValue({
                getPayload: () => ({
                    ...googleTokenPayloadFixture,
                    sub: "attacker-different-google-subject",
                }),
            } as never);

        const response = await completeOAuth(await startOAuth());

        expect(response.status).toBe(409);
        expect(response.body.message).toBe(
            "Account already exists. Account linking is required."
        );

        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(1);

        const account = await prisma.oAuthAccount.findFirstOrThrow();

        expect(account.userId).toBe(original.id);
        expect(account.providerAccountId).toBe(
            googleTokenPayloadFixture.sub
        );
    });

    it("should handle concurrent first-time Google logins without duplicate accounts", async () => {
        await createDefaultRole();
        mockGoogle(googleTokenPayloadFixture);

        const requestCount = 15;

        // Separate valid state and cookie for every request.
        const flows = await Promise.all(
            Array.from(
                { length: requestCount },
                () => startOAuth()
            )
        );

        const responses = await Promise.all(
            flows.map((flow) => completeOAuth(flow))
        );

        // Every login must succeed against the same identity.
        expect(
            responses.map((response) => response.status)
        ).toEqual(Array(requestCount).fill(200));

        expect(await prisma.user.count()).toBe(1);
        expect(await prisma.oAuthAccount.count()).toBe(1);

        const user = await prisma.user.findFirstOrThrow();

        for (const response of responses) {
            const payload = verifyAccessToken(
                response.body.data.accessToken
            );

            expect(payload.userId).toBe(user.id);
        }
    });

    it("should roll back account creation when the default role is missing", async () => {
        mockGoogle(googleTokenPayloadFixture);

        // Intentionally do not create the default role.
        const response = await completeOAuth(await startOAuth());

        expect(response.status).toBe(500);
        expect(response.body.message).toBe(
            "Default role is not configured"
        );

        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        await expectNoSession(response);
    });

    it("should not create a session when a database operation fails", async () => {
        mockGoogle(googleTokenPayloadFixture);
        await createDefaultRole();

        const flow = await startOAuth();

        // Simulate a database failure at the transaction boundary.
        const databaseSpy = vi.spyOn(
            prisma,
            "$transaction"
        ).mockRejectedValueOnce(
            new Error("Simulated database failure")
        );

        const response = await completeOAuth(flow);

        expect(response.status).toBe(500);
        expect(databaseSpy).toHaveBeenCalledOnce();

        // No user or OAuth account should exist.
        expect(await prisma.user.count()).toBe(0);
        expect(await prisma.oAuthAccount.count()).toBe(0);

        // No application session should be issued.
        await expectNoSession(response);
    });
});
