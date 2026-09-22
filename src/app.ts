import express from "express";

const app = express();

// Global middleware
app.use(express.json());

export default app;