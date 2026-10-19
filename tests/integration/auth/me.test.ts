import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { api } from "../../helpers/api.helper.js";
import {
    loginTestUser,
    withAuth,
} from "../../helpers/auth.helper.js";
import { setupIntegrationTests } from "../../setup/integration.js";

import { prisma } from "../../../src/config/db.js";
import { verifyAccessToken } from "../../../src/utils/jwt.js";

const endpoint = "/api/v1/auth/me";

describe("GET /api/v1/auth/me", () => {
    setupIntegrationTests();

    it("should return the authenticated user's information", async () => {
        const { user, accessToken } = await loginTestUser({
            role: "EMPLOYEE",
            permissions: ["user:read", "product:create"],
        });

        const response = await api
            .get(endpoint)
            .set(withAuth(accessToken))
            .expect(200);

        expect(response.body.data).toMatchObject({
            id: user.id,
            name: user.name,
            email: user.email,
            role: "EMPLOYEE",
            permissions: expect.arrayContaining([
                "user:read",
                "product:create",
            ]),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
        });

        expect(response.body.data.permissions).toHaveLength(2);

        // Sensitive fields must never be exposed.
        expect(response.body.data).not.toHaveProperty("password");
        expect(response.body.data).not.toHaveProperty("authVersion");
    });

    it("should reject requests without an access token", async () => {
        const response = await api
            .get(endpoint)
            .expect(401);

        expect(response.body).toMatchObject({
            status: "error",
            message: "Authentication required",
        });
    });

    it("should reject malformed access tokens", async () => {
        const response = await api
            .get(endpoint)
            .set(withAuth("invalid.jwt.token"))
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or expired token"
        );
    });

    it("should reject expired access tokens", async () => {
        const { accessToken } = await loginTestUser();

        const payload = verifyAccessToken(accessToken);

        const expiredToken = jwt.sign(
            {
                userId: payload.userId,
                roleId: payload.roleId,
                role: payload.role,
                permissions: payload.permissions,
                roleVersion: payload.roleVersion,
                userVersion: payload.userVersion,
            },
            process.env.JWT_ACCESS_SECRET!,
            { expiresIn: -1 }
        );

        const response = await api
            .get(endpoint)
            .set(withAuth(expiredToken))
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or expired token"
        );
    });

    it("should reject access tokens signed with an incorrect secret", async () => {
        const { accessToken } = await loginTestUser();

        const payload = verifyAccessToken(accessToken);

        const invalidToken = jwt.sign(
            {
                userId: payload.userId,
                roleId: payload.roleId,
                role: payload.role,
                permissions: payload.permissions,
                roleVersion: payload.roleVersion,
                userVersion: payload.userVersion,
            },
            "incorrect-secret",
            { expiresIn: "15m" }
        );

        const response = await api
            .get(endpoint)
            .set(withAuth(invalidToken))
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or expired token"
        );
    });

    it("should reject invalid Authorization header formats", async () => {
        const { accessToken } = await loginTestUser();

        const response = await api
            .get(endpoint)
            .set("Authorization", accessToken)
            .expect(401);

        expect(response.body.message).toBe(
            "Authentication required"
        );
    });

    it("should reject a token belonging to a deleted user", async () => {
        const { user, accessToken } = await loginTestUser();

        // Delete the user after issuing the token.
        await prisma.user.delete({
            where: { id: user.id },
        });

        const response = await api
            .get(endpoint)
            .set(withAuth(accessToken))
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid or revoked token"
        );
    });
});
