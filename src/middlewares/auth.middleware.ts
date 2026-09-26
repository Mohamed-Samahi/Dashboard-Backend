import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { verifyAccessToken } from "../utils/jwt.js";

const authenticate = (
    request: Request,
    _response: Response,
    next: NextFunction
) => {
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
        throw new AppError("Authentication required", 401);
    }

    const token = authorization.split(" ")[1];

    if (!token) {
        throw new AppError("Authentication required", 401);
    }

    try {
        const payload = verifyAccessToken(token);

        request.user = payload;

        next();
    } catch {
        throw new AppError("Invalid or expired token", 401);
    }
};

export { authenticate };