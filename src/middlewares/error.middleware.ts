import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/AppError.js";
import logger from "../config/logger.js";

export const errorHandler = (
    error: Error,
    request: Request,
    response: Response,
    next: NextFunction
) => {
    if (error instanceof AppError) {
        return response.status(error.statusCode).json({
            status: "error",
            message: error.message,
        });
    }

    logger.error("Unexpected application error", {
        error,
    });
    return response.status(500).json({
        status: "error",
        message: "Internal server error",
    });
};