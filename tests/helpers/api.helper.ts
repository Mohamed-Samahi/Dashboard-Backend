
import request from "supertest";
import app from "../../src/app.js";

// Stateless API requests
export const api = request(app);

// Stateful client: persists cookies between requests
export const createApiAgent = () => request.agent(app);
