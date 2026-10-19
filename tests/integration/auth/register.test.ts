import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../../src/config/db.js";
import { api } from "../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../setup/integration.js";

const endpoint = "/api/v1/auth/register";

const validUser = () => ({
    name: "Test User",
    email: "test@example.com",
    password: "Password123!",
});

describe("POST /api/v1/auth/register", () => {
    setupIntegrationTests();

    beforeEach(async () => {
        await prisma.role.create({
            data: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });
    });

    it("should register a new user successfully", async () => {
        const user = validUser();

        const response = await api
            .post(endpoint)
            .send(user)
            .expect(201);

        expect(response.body.data).toMatchObject({
            id: expect.any(String),
            name: user.name,
            email: user.email,
            role: {
                name: process.env.DEFAULT_USER_ROLE ?? "USER",
            },
        });

        expect(response.body.data).not.toHaveProperty("password");

        const savedUser = await prisma.user.findUnique({
            where: { email: user.email },
        });

        expect(savedUser).not.toBeNull();
        expect(savedUser?.id).toBe(response.body.data.id);
    });

    it("should reject duplicate emails", async () => {
        const user = validUser();

        await api.post(endpoint).send(user).expect(201);

        const response = await api
            .post(endpoint)
            .send(user)
            .expect(409);

        expect(response.body.message).toBe("User already exists");

        expect(
            await prisma.user.count({
                where: { email: user.email },
            })
        ).toBe(1);
    });

    it.each([
        ["invalid email", { ...validUser(), email: "invalid" }],
        ["short password", { ...validUser(), password: "123" }],
        ["short name", { ...validUser(), name: "A" }],
        [
            "missing email",
            { name: "Test User", password: "Password123!" },
        ],
        [
            "missing password",
            { name: "Test User", email: "test@example.com" },
        ],
    ])("should reject %s", async (_scenario, data) => {
        const response = await api
            .post(endpoint)
            .send(data)
            .expect(400);

        expect(response.body.message).toBe("Validation failed");
        expect(response.body.errors.length).toBeGreaterThan(0);

        expect(await prisma.user.count()).toBe(0);
    });

    it("should hash passwords before saving them", async () => {
        const user = validUser();

        await api.post(endpoint).send(user).expect(201);

        const savedUser = await prisma.user.findUniqueOrThrow({
            where: { email: user.email },
        });

        expect(savedUser.password).not.toBe(user.password);

        expect(
            await bcrypt.compare(user.password, savedUser.password)
        ).toBe(true);

        expect(
            await bcrypt.compare("WrongPassword123!", savedUser.password)
        ).toBe(false);
    });
});
