import { api } from "./api.helper.js";

import {
    generateAccessToken,
} from "../../src/utils/jwt.js";

import { prisma } from "../../src/config/db.js";

import { createTestUser } from "../factories/user.factory.js";

type UserOptions = Parameters<typeof createTestUser>[0];

export async function loginTestUser(
    options: UserOptions = {}
) {
    const { user, plainPassword } =
        await createTestUser(options);

    const response = await api
        .post("/api/v1/auth/login")
        .send({
            email: user.email,
            password: plainPassword,
        })
        .expect(200);

    return {
        user,
        accessToken: response.body.data.accessToken as string,
        cookies: response.headers["set-cookie"],
    };
}

export async function createTestAccessToken(
    userId: string
) {
    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true,
                        },
                    },
                },
            },
        },
    });

    return generateAccessToken({
        userId: user.id,
        roleId: user.role.id,
        role: user.role.name,
        permissions: user.role.permissions.map(
            ({ permission }) => permission.key
        ),
        roleVersion: user.role.authVersion,
        userVersion: user.authVersion,
    });
}

export function withAuth(token: string) {
    return { Authorization: `Bearer ${token}` };
}
