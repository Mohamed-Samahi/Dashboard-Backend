import { describe, expect, it } from "vitest";

import { api } from "../../helpers/api.helper.js";
import {
    loginTestUser,
    withAuth,
} from "../../helpers/auth.helper.js";
import { setupIntegrationTests } from "../../setup/integration.js";

const endpoint = "/api/v1/rbac/users";

describe("RBAC Authorization", () => {
    setupIntegrationTests();

    it("should return 403 when the user lacks permission", async () => {
        const { accessToken } = await loginTestUser({
            role: "USER",
            permissions: [],
        });

        const response = await api
            .get(endpoint)
            .set(withAuth(accessToken))
            .expect(403);

        expect(response.body).toMatchObject({
            status: "error",
            message: "Forbidden",
        });
    });

    it("should allow access when the user has the required permission", async () => {
        const { accessToken } = await loginTestUser({
            role: "EMPLOYEE",
            permissions: ["user:read"],
        });

        const response = await api
            .get(endpoint)
            .set(withAuth(accessToken))
            .expect(200);

        expect(response.body.data).toEqual(
            expect.any(Array)
        );
    });
});
