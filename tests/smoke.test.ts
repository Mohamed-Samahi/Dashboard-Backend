
import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Application Smoke Tests", () => {
    it("should initialize the Express application", () => {
        expect(app).toBeDefined();
        expect(typeof app).toBe("function");
    });

    it("should return 404 for an unknown route", async () => {
        const response = await request(app).get("/non-existent-route");

        expect(response.status).toBe(404);
    });
});
