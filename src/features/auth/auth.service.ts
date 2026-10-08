import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { AppError } from "../../errors/AppError.js";

import type { LoginData, RegisterData } from "./auth.schema.js";

import {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
} from "../../utils/jwt.js";

import {
    deleteRefreshToken,
    getRefreshTokenUser,
    storeRefreshToken,
} from "../../utils/refreshToken.js";

const findUserByEmail = async (email: string) => {
    return prisma.user.findUnique({
        where: { email },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            },
        },
    });
};

const registerUser = async (data: RegisterData) => {
    const existingUser = await findUserByEmail(data.email);

    if (existingUser) {
        throw new AppError("User already exists", 409);
    }

    const defaultRoleName = process.env.DEFAULT_USER_ROLE;

    if (!defaultRoleName) {
        throw new Error("DEFAULT_USER_ROLE is not defined");
    }

    const defaultRole = await prisma.role.findUnique({
        where: {
            name: defaultRoleName,
        },
    });

    if (!defaultRole) {
        throw new AppError("Default USER role is not configured", 500);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
        data: {
            name: data.name ?? null,
            email: data.email,
            password: hashedPassword,
            roleId: defaultRole.id,
        },
        include: {
            role: true,
        },
    });
};

const loginUser = async (data: LoginData) => {
    const user = await findUserByEmail(data.email);

    if (!user) {
        throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password
    );

    if (!isPasswordValid) {
        throw new AppError("Invalid credentials", 401);
    }

    const permissions = user.role.permissions.map(
        (rolePermission) => rolePermission.permission.key
    );

    const accessToken = generateAccessToken({
        userId: user.id,
        roleId: user.role.id,
        role: user.role.name,
        permissions,
        roleVersion: user.role.authVersion,
    });

    const refreshToken = generateRefreshToken({
        userId: user.id,
    });

    await storeRefreshToken(user.id, refreshToken);

    return {
        accessToken,
        refreshToken,
    };
};

const getCurrentUser = async (userId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            role: {
                select: {
                    name: true,
                    permissions: {
                        select: {
                            permission: {
                                select: {
                                    key: true,
                                },
                            },
                        },
                    },
                },
            },
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!user) {
        throw new AppError("User not found", 404);
    }

    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        permissions: user.role.permissions.map(
            (rolePermission) => rolePermission.permission.key
        ),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    };
};

const refreshUserToken = async (refreshToken: string) => {
    let payload;

    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        throw new AppError("Invalid or expired refresh token", 401);
    }

    const storedUserId = await getRefreshTokenUser(refreshToken);

    if (!storedUserId || storedUserId !== payload.userId) {
        throw new AppError("Invalid or expired refresh token", 401);
    }

    const user = await prisma.user.findUnique({
        where: {
            id: payload.userId,
        },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            },
        },
    });

    if (!user) {
        throw new AppError("User not found", 401);
    }

    await deleteRefreshToken(refreshToken);

    const newRefreshToken = generateRefreshToken({
        userId: user.id,
    });

    await storeRefreshToken(user.id, newRefreshToken);

    const permissions = user.role.permissions.map(
        (rolePermission) => rolePermission.permission.key
    );

    const accessToken = generateAccessToken({
        userId: user.id,
        roleId: user.role.id,
        role: user.role.name,
        permissions,
        roleVersion: user.role.authVersion,
    });

    return {
        accessToken,
        refreshToken: newRefreshToken,
    };
};

const logoutUser = async (refreshToken: string) => {
    await deleteRefreshToken(refreshToken);
};

export {
    registerUser,
    loginUser,
    getCurrentUser,
    refreshUserToken,
    logoutUser,
};