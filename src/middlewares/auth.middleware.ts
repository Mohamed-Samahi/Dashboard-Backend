import type { NextFunction, Request, Response } from "express";

import { prisma } from "../config/db.js";

import { AppError } from "../errors/AppError.js";

import {
    getRoleVersion,
    setRoleVersion,
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

    let currentRoleVersion = await getRoleVersion(
        payload.roleId
    );

    // Redis cache miss: restore the version from PostgreSQL.
    if (currentRoleVersion === null) {
        const role = await prisma.role.findUnique({
            where: {
                id: payload.roleId,
            },
            select: {
                authVersion: true,
            },
        });

        if (!role) {
            throw new AppError("Invalid or revoked token", 401);
        }

        currentRoleVersion = role.authVersion;

        await setRoleVersion(
            payload.roleId,
            currentRoleVersion
        );
    }

    if (payload.roleVersion !== currentRoleVersion) {
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