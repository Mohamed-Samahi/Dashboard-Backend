import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export const validate = (schema: ZodType) => {
    return (
        request: Request,
        _response: Response,
        next: NextFunction
    ) => {
        request.body = schema.parse(request.body);

        next();
    };
};