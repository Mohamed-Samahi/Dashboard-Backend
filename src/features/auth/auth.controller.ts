import type { Request, Response } from "express";

import {
    registerUser,
    loginUser,
    getCurrentUser,
} from "./auth.service.js";

const register = async (request: Request, response: Response) => {
    const user = await registerUser(request.body);

    return response.status(201).json({
        message: "User registered successfully",
        data: user,
    });
};

const login = async (request: Request, response: Response) => {
    const accessToken = await loginUser(request.body);

    return response.status(200).json({
        message: "User logged in successfully",
        data: { accessToken },
    });
};

const logout = async (_request: Request, response: Response) => {
    // Implement after refresh-token strategy
    return response.status(204).send();
};

const refresh = async (_request: Request, response: Response) => {
    // Implement after refresh-token strategy
    return response.status(501).json({
        message: "Not implemented yet",
    });
};

const getMe = async (request: Request, response: Response) => {
    const userId = request.user!.userId;

    const user = await getCurrentUser(userId);

    return response.status(200).json({
        data: user,
    });
};

export {
    register,
    login,
    logout,
    refresh,
    getMe,
};