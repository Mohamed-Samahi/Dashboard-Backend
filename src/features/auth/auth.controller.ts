import type { Request, Response } from "express";

import {
    loginUser,
    registerUser,
} from "./auth.service.js";

const register = async (request: Request, response: Response) => {
    const user = await registerUser(request.body);

    return response.status(201).json({
        message: "User registered successfully",
        data: user,
    });
};

const login = async (request: Request, response: Response) => {
    const user = await loginUser(request.body);

    return response.status(200).json({
        message: "User logged in successfully",
        data: user,
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
};;

export {
    register,
    login,
    logout,
    refresh,
};