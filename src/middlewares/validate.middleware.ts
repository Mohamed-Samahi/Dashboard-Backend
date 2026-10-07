import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "params";

export const validate = (
    schema: ZodType,
    part: RequestPart = "body"
) => {
    return (
        request: Request,
        _response: Response,
        next: NextFunction
    ) => {
        const result = schema.parse(request[part]);

        // Body needs reassignment because schemas may transform values
        if (part === "body") {
            request.body = result;
        }

        next();
    };
};