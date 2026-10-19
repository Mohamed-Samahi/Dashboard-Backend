import { describe, expect, it } from "vitest";
import jwt from "jsonwebtoken";

import { api } from "../../helpers/api.helper.js";
import { createTestUser } from "../../factories/user.factory.js";
import { setupIntegrationTests } from "../../setup/integration.js";
import { verifyAccessToken } from "../../../src/utils/jwt.js";

const endpoint = "/api/v1/auth/login";

describe("POST /api/v1/auth/login", () => {
    setupIntegrationTests();

    it("should login successfully with valid credentials", async () => {
        const { user, plainPassword } = await createTestUser();

        const response = await api
            .post(endpoint)
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        expect(response.body.message).toBe(
            "User logged in successfully"
        );

        expect(response.body.data.accessToken).toEqual(
            expect.any(String)
        );

        expect(response.body.data).not.toHaveProperty(
            "refreshToken"
        );
    });

    it.each([
        ["incorrect password", "wrong-password"],
        ["empty password", ""],
    ])("should reject %s", async (_scenario, password) => {
        const { user } = await createTestUser();

        const response = await api
            .post(endpoint)
            .send({
                email: user.email,
                password,
            })
            .expect(password === "" ? 400 : 401);

        expect(response.body.status).toBe("error");
    });

    it("should reject a non-existing email", async () => {
        const response = await api
            .post(endpoint)
            .send({
                email: "unknown@example.com",
                password: "Password123!",
            })
            .expect(401);

        expect(response.body.message).toBe(
            "Invalid credentials"
        );
    });

    it("should issue a valid access token with correct claims", async () => {
        const { user, plainPassword } = await createTestUser({
            role: "EMPLOYEE",
            permissions: ["user:read", "product:create"],
        });

        const response = await api
            .post(endpoint)
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        const accessToken = response.body.data.accessToken;

        const payload = verifyAccessToken(accessToken);

        expect(payload).toMatchObject({
            userId: user.id,
            roleId: user.roleId,
            role: "EMPLOYEE",
            permissions: expect.arrayContaining([
                "user:read",
                "product:create",
            ]),
            roleVersion: user.role.authVersion,
            userVersion: user.authVersion,
        });

        expect(payload.permissions).toHaveLength(2);

        const decoded = jwt.decode(accessToken, {
            complete: true,
        });

        expect(decoded).not.toBeNull();
        expect(decoded?.header.alg).toBe("HS256");

        expect(payload).toHaveProperty("iat");
        expect(payload).toHaveProperty("exp");

        const { iat, exp } = payload as typeof payload & {
            iat: number;
            exp: number;
        };

        expect(exp).toBeGreaterThan(iat);
        expect(exp - iat).toBe(
            Number(process.env.JWT_ACCESS_EXPIRES_IN?.replace("m", "")) * 60
        );
    });

    it("should reject malformed email input", async () => {
        const response = await api
            .post(endpoint)
            .send({
                email: "invalid-email",
                password: "Password123!",
            })
            .expect(400);

        expect(response.body.message).toBe(
            "Validation failed"
        );
    });
});
