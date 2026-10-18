
import { describe, it, expect } from "vitest";

import { createApiAgent } from "../../helpers/api.helper.js";
import { setupIntegrationTests } from "../../setup/integration.js";
import { createTestUser } from "../../factories/user.factory.js";

describe("Supertest Cookie Agent", () => {
    setupIntegrationTests();

    it("should preserve refresh cookies across requests", async () => {
        const agent = createApiAgent();

        const { user, plainPassword } =
            await createTestUser();

        const loginResponse = await agent
            .post("/api/v1/auth/login")
            .send({
                email: user.email,
                password: plainPassword,
            })
            .expect(200);

        expect(
            loginResponse.headers["set-cookie"]
        ).toBeDefined();

        const refreshResponse = await agent
            .post("/api/v1/auth/refresh")
            .expect(200);

        expect(
            refreshResponse.body.data.accessToken
        ).toBeDefined();
    });
});
