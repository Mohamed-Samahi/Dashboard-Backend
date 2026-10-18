
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/config/db.js";

type CreateUserOptions = {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    permissions?: string[];
};

export async function createTestUser(
    options: CreateUserOptions = {}
) {
    const {
        name = "Test User",
        email = `test-${randomUUID()}@example.com`,
        password = "TestPassword123!",
        role = process.env.DEFAULT_USER_ROLE ?? "USER",
        permissions = [],
    } = options;

    const dbRole = await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
    });

    for (const key of permissions) {
        const permission = await prisma.permission.upsert({
            where: { key },
            update: {},
            create: { key },
        });

        await prisma.rolePermission.upsert({
            where: {
                roleId_permissionId: {
                    roleId: dbRole.id,
                    permissionId: permission.id,
                },
            },
            update: {},
            create: {
                roleId: dbRole.id,
                permissionId: permission.id,
            },
        });
    }

    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: await bcrypt.hash(password, 10),
            roleId: dbRole.id,
        },
        include: {
            role: true,
        },
    });

    return { user, plainPassword: password };
}
