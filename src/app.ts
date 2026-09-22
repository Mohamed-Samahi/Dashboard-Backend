import express from "express";

import { errorHandler } from "./middlewares/error.middleware.js";
import { AppError } from "./errors/AppError.js";

const app = express();

// Global middleware
app.use(express.json());

// Global error handler
// IMPORTANT: Must be registered after the routes
app.use(errorHandler);

export default app;