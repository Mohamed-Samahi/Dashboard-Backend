import { describe, expect, it } from "vitest";

import {
    registerSchema,
    loginSchema,
} from "../../../../src/features/auth/auth.schema.js";

describe("Authentication Schemas", () => {
    describe("registerSchema", () => {
        const validUser = {
            name: "Test User",
            email: "test@example.com",
            password: "Password123!",
        };

        it("should accept valid registration data", () => {
            expect(registerSchema.safeParse(validUser).success).toBe(true);
        });

        it("should allow registration without an optional name", () => {
            const { name, ...data } = validUser;

            expect(registerSchema.safeParse(data).success).toBe(true);
        });

        it.each([
            ["invalid email", { ...validUser, email: "invalid" }],
            ["short password", { ...validUser, password: "123" }],
            ["short name", { ...validUser, name: "A" }],
            ["missing email", { name: "Test", password: "Password123!" }],
            ["missing password", { name: "Test", email: "test@example.com" }],
        ])("should reject %s", (_scenario, data) => {
            expect(registerSchema.safeParse(data).success).toBe(false);
        });
    });

    describe("loginSchema", () => {
        it("should accept valid credentials", () => {
            expect(loginSchema.safeParse({
                email: "test@example.com",
                password: "Password123!",
            }).success).toBe(true);
        });

        it.each([
            ["invalid email", { email: "invalid", password: "Password123!" }],
            ["empty password", { email: "test@example.com", password: "" }],
            ["missing email", { password: "Password123!" }],
            ["missing password", { email: "test@example.com" }],
        ])("should reject %s", (_scenario, data) => {
            expect(loginSchema.safeParse(data).success).toBe(false);
        });
    });
});
