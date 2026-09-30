import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import { getUserPermissions } from "../features/rbac/rbac.service.js";

const authorize = (requiredPermission: string) => {
    return async (
        request: Request,
        _response: Response,
        next: NextFunction
    ) => {
        if (!request.user) {
            throw new AppError("Authentication required", 401);
        }

        const permissions = await getUserPermissions(
            request.user.userId
        );

        if (!permissions.includes(requiredPermission)) {
            throw new AppError("Forbidden", 403);
        }

        next();
    };
};

export { authorize };