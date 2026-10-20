
import { describe, expect, it, vi } from "vitest";

import type {
    Request,
    Response,
    NextFunction,
} from "express";

import { authorize } from "../../../src/middlewares/authorize.middleware.js";
import { AppError } from "../../../src/errors/AppError.js";

describe("Authorization Middleware", () => {
    const createMocks = (
        permissions: string[] = [],
        authenticated = true
    ) => {
        const request = {
            ...(authenticated && {
                user: {
                    id: "user-123",
                    role: "EMPLOYEE",
                    permissions,
                },
            }),
        } as Request;

        const response = {} as Response;
        const next = vi.fn() as NextFunction;

        return { request, response, next };
    };

    it("should allow access when the user has the required permission", () => {
        const { request, response, next } = createMocks([
            "user:read",
            "product:create",
        ]);

        authorize("user:read")(request, response, next);

        expect(next).toHaveBeenCalledOnce();
        expect(next).toHaveBeenCalledWith();
    });

    it("should return 403 when the user lacks the required permission", () => {
        const { request, response, next } = createMocks([
            "product:read",
        ]);

        expect(() =>
            authorize("user:read")(request, response, next)
        ).toThrow(
            new AppError("Forbidden", 403)
        );

        expect(next).not.toHaveBeenCalled();
    });

    it("should return 401 when the user is not authenticated", () => {
        const { request, response, next } = createMocks(
            [],
            false
        );

        expect(() =>
            authorize("user:read")(request, response, next)
        ).toThrow(
            new AppError("Authentication required", 401)
        );

        expect(next).not.toHaveBeenCalled();
    });

    it("should reject authenticated users with no permissions", () => {
        const { request, response, next } = createMocks([]);

        expect(() =>
            authorize("user:read")(request, response, next)
        ).toThrow(
            new AppError("Forbidden", 403)
        );

        expect(next).not.toHaveBeenCalled();
    });

    it("should require an exact permission match", () => {
        const { request, response, next } = createMocks([
            "user:read",
        ]);

        expect(() =>
            authorize("user:read:all")(request, response, next)
        ).toThrow(
            new AppError("Forbidden", 403)
        );

        expect(next).not.toHaveBeenCalled();
    });

    it("should evaluate permissions independently of role names", () => {
        const { request, response, next } = createMocks([
            "user:read",
        ]);

        Object.assign(request, {
            user: {
                id: "user-123",
                role: "CUSTOM_ROLE",
                permissions: ["user:read"],
            },
        });

        authorize("user:read")(request, response, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it("should not authorize a different permission", () => {
        const { request, response, next } = createMocks([
            "user:read",
        ]);

        expect(() =>
            authorize("user:delete")(request, response, next)
        ).toThrow(
            new AppError("Forbidden", 403)
        );

        expect(next).not.toHaveBeenCalled();
    });
});
