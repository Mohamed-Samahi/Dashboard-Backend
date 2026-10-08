import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";

const authorize = (requiredPermission: string) => {
    return (
        request: Request,
        _response: Response,
        next: NextFunction
    ) => {
        if (!request.user) {
            throw new AppError("Authentication required", 401);
        }

        if (!request.user.permissions.includes(requiredPermission)) {
            throw new AppError("Forbidden", 403);
        }

        next();
    };
};

export { authorize };