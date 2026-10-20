import { describe, expect, it, vi } from "vitest";
import { z, ZodError } from "zod";

import type {
    Request,
    Response,
    NextFunction,
} from "express";

import { validate } from "../../../src/middlewares/validate.middleware.js";

describe("Validation Middleware", () => {
    const schema = z.object({
        name: z.string().trim().toUpperCase(),
    });

    const createMocks = (body: unknown, params: unknown = {}) => {
        const request = {
            body,
            params,
        } as Request;

        const response = {} as Response;
        const next = vi.fn() as NextFunction;

        return { request, response, next };
    };

    it("should validate request body successfully", () => {
        const { request, response, next } = createMocks({
            name: "Test",
        });

        validate(schema)(request, response, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it("should apply Zod transformations to request body", () => {
        const { request, response, next } = createMocks({
            name: "  manager  ",
        });

        validate(schema)(request, response, next);

        expect(request.body).toEqual({
            name: "MANAGER",
        });

        expect(next).toHaveBeenCalledOnce();
    });

    it("should throw ZodError for invalid request body", () => {
        const { request, response, next } = createMocks({
            name: 123,
        });

        expect(() =>
            validate(schema)(request, response, next)
        ).toThrow(ZodError);

        expect(next).not.toHaveBeenCalled();
    });

    it("should validate route parameters", () => {
        const paramsSchema = z.object({
            roleId: z.uuid(),
        });

        const { request, response, next } = createMocks(
            {},
            { roleId: "550e8400-e29b-41d4-a716-446655440000" }
        );

        validate(paramsSchema, "params")(request, response, next);

        expect(next).toHaveBeenCalledOnce();
    });

    it("should reject invalid route parameters", () => {
        const paramsSchema = z.object({
            roleId: z.uuid(),
        });

        const { request, response, next } = createMocks(
            {},
            { roleId: "invalid-uuid" }
        );

        expect(() =>
            validate(paramsSchema, "params")(request, response, next)
        ).toThrow(ZodError);

        expect(next).not.toHaveBeenCalled();
    });
});
