import { describe, expect, it } from "vitest";

import {
    createRoleSchema,
    updateRoleSchema,
    roleParamsSchema,
    assignUserRoleSchema,
} from "../../../../src/features/rbac/rbac.schema.js";

const validRoleId = "550e8400-e29b-41d4-a716-446655440000";

describe("RBAC Schemas", () => {
    describe("createRoleSchema", () => {
        it("should accept valid role data", () => {
            const result = createRoleSchema.safeParse({
                name: "MANAGER",
                permissions: ["user:read", "user:create"],
            });

            expect(result.success).toBe(true);
        });

        it("should trim and uppercase role names", () => {
            const result = createRoleSchema.parse({
                name: "  manager  ",
            });

            expect(result.name).toBe("MANAGER");
        });

        it("should default permissions to an empty array", () => {
            const result = createRoleSchema.parse({
                name: "MANAGER",
            });

            expect(result.permissions).toEqual([]);
        });

        it("should reject duplicate permissions", () => {
            const result = createRoleSchema.safeParse({
                name: "MANAGER",
                permissions: ["user:read", "user:read"],
            });

            expect(result.success).toBe(false);
        });

        it("should trim permission strings", () => {
            const result = createRoleSchema.parse({
                name: "MANAGER",
                permissions: ["  user:read  "],
            });

            expect(result.permissions).toEqual(["user:read"]);
        });

        it.each([
            ["empty name", ""],
            ["short name", "A"],
            ["whitespace-only name", "   "],
        ])("should reject %s", (_scenario, name) => {
            expect(createRoleSchema.safeParse({
                name,
                permissions: [],
            }).success).toBe(false);
        });

        it("should reject empty permission strings", () => {
            expect(createRoleSchema.safeParse({
                name: "MANAGER",
                permissions: ["  "],
            }).success).toBe(false);
        });
    });

    describe("updateRoleSchema", () => {
        it("should accept a name-only update", () => {
            expect(updateRoleSchema.safeParse({
                name: "SUPERVISOR",
            }).success).toBe(true);
        });

        it("should accept a permissions-only update", () => {
            expect(updateRoleSchema.safeParse({
                permissions: ["user:read"],
            }).success).toBe(true);
        });

        it("should reject an empty update", () => {
            const result = updateRoleSchema.safeParse({});

            expect(result.success).toBe(false);

            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe(
                    "At least one field must be provided"
                );
            }
        });

        it("should allow clearing all permissions", () => {
            const result = updateRoleSchema.parse({
                permissions: [],
            });

            expect(result.permissions).toEqual([]);
        });

        it("should reject duplicate permissions on update", () => {
            expect(updateRoleSchema.safeParse({
                permissions: ["user:read", "user:read"],
            }).success).toBe(false);
        });
    });

    describe("UUID Validation", () => {
        it("should accept valid role IDs", () => {
            expect(roleParamsSchema.safeParse({
                roleId: validRoleId,
            }).success).toBe(true);

            expect(assignUserRoleSchema.safeParse({
                roleId: validRoleId,
            }).success).toBe(true);
        });

        it.each([
            ["invalid ID", "123"],
            ["empty ID", ""],
            ["missing ID", undefined],
        ])("should reject %s", (_scenario, roleId) => {
            expect(roleParamsSchema.safeParse({
                roleId,
            }).success).toBe(false);

            expect(assignUserRoleSchema.safeParse({
                roleId,
            }).success).toBe(false);
        });
    });
});
