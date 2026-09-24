import express from "express";

import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

// Global middleware
app.use(express.json());

// Global error handler
// IMPORTANT: Must be registered after the routes
app.use(errorHandler);

export default app;