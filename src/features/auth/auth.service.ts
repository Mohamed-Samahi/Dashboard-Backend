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
} from "../../utils/refreshToken.js";

import { storeRefreshToken } from "../../utils/refreshToken.js";

const findUserByEmail = async (email: string) => {
    return prisma.user.findUnique({
        where: { email },
    });
};

const registerUser = async (data: RegisterData) => {
    const existingUser = await findUserByEmail(data.email);

    if (existingUser) {
        throw new AppError("User already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
        data: {
            name: data.name ?? null,
            email: data.email,
            password: hashedPassword,
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

    const accessToken = generateAccessToken({
        userId: user.id,
        name: user.name,
        role: user.role,
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
            role: true,
            createdAt: true,
            updatedAt: true,
        },
    });

    if (!user) {
        throw new AppError("User not found", 404);
    }

    return user;
};

const refreshUserToken = async (refreshToken: string) => {
    let payload;

    try {
        payload = verifyRefreshToken(refreshToken);
    } catch {
        throw new AppError("Invalid or expired refresh token", 401);
    }

    // Check that the refresh token still exists in Redis
    const storedUserId = await getRefreshTokenUser(refreshToken);

    if (!storedUserId || storedUserId !== payload.userId) {
        throw new AppError("Invalid or expired refresh token", 401);
    }

    // Get the latest user data
    const user = await prisma.user.findUnique({
        where: {
            id: payload.userId,
        },
    });

    if (!user) {
        throw new AppError("User not found", 401);
    }

    // Revoke the old refresh token
    await deleteRefreshToken(refreshToken);

    // Generate a new refresh token
    const newRefreshToken = generateRefreshToken({
        userId: user.id,
    });

    // Store the new refresh token in Redis
    await storeRefreshToken(user.id, newRefreshToken);

    // Generate a new access token
    const accessToken = generateAccessToken({
        userId: user.id,
        name: user.name,
        role: user.role,
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