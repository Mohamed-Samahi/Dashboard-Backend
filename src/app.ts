import express from "express";

import authRouter from "./features/auth/auth.route.js";

import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

// Global middleware
app.use(express.json());

// Routes
app.use("/api/auth", authRouter);

// Global error handler
// IMPORTANT: Must be registered after the routes
app.use(errorHandler);

export default app;