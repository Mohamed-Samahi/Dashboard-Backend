import type { Request, Response } from "express";

import {
    registerUser,
    loginUser,
    getCurrentUser,
    refreshUserToken,
    logoutUser,
} from "./auth.service.js";

import { AppError } from "../../errors/AppError.js";

const getRefreshCookieMaxAge = () => {
    const expiresInSeconds = Number(
        process.env.JWT_REFRESH_EXPIRES_IN_SECONDS
    );

    if (!expiresInSeconds || expiresInSeconds <= 0) {
        throw new Error(
            "JWT_REFRESH_EXPIRES_IN_SECONDS is not defined or invalid"
        );
    }

    return expiresInSeconds * 1000;
};

const register = async (request: Request, response: Response) => {
    const user = await registerUser(request.body);

    return response.status(201).json({
        message: "User registered successfully",
        data: user,
    });
};

const login = async (request: Request, response: Response) => {
    const { accessToken, refreshToken } = await loginUser(request.body);

    response.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: getRefreshCookieMaxAge(),
    });

    return response.status(200).json({
        message: "User logged in successfully",
        data: { accessToken },
    });
};

const refresh = async (request: Request, response: Response) => {
    const refreshToken = request.cookies.refreshToken;

    if (!refreshToken) {
        throw new AppError("Refresh token is required", 401);
    }

    const {
        accessToken,
        refreshToken: newRefreshToken,
    } = await refreshUserToken(refreshToken);

    response.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: getRefreshCookieMaxAge(),
    });

    return response.status(200).json({
        data: {
            accessToken,
        },
    });
};

const getMe = async (request: Request, response: Response) => {
    const userId = request.user!.id;

    const user = await getCurrentUser(userId);

    return response.status(200).json({
        data: user,
    });
};

const logout = async (request: Request, response: Response) => {
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
        await logoutUser(refreshToken);
    }

    response.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });

    return response.status(204).send();
};

export {
    register,
    login,
    logout,
    refresh,
    getMe,
};