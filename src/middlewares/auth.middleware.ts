import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/db.js";
import { AppError } from "../errors/AppError.js";
import {
    getAuthVersion,
    setAuthVersion,
} from "../utils/authVersion.js";
import { verifyAccessToken } from "../utils/jwt.js";

const authenticate = async (
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

    let payload;

    try {
        payload = verifyAccessToken(token);
    } catch {
        throw new AppError("Invalid or expired token", 401);
    }

    let currentAuthVersion = await getAuthVersion(
        payload.userId
    );

    // Redis cache miss: restore the version from PostgreSQL.
    if (currentAuthVersion === null) {
        const user = await prisma.user.findUnique({
            where: {
                id: payload.userId,
            },
            select: {
                authVersion: true,
            },
        });

        if (!user) {
            throw new AppError("Invalid or expired token", 401);
        }

        currentAuthVersion = user.authVersion;

        await setAuthVersion(
            payload.userId,
            currentAuthVersion
        );
    }

    if (payload.authVersion !== currentAuthVersion) {
        throw new AppError("Invalid or revoked token", 401);
    }

    request.user = {
        id: payload.userId,
        role: payload.role,
        permissions: payload.permissions,
    };

    next();
};

export { authenticate };