import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const main = async () => {
    // 1. Create roles
    const adminRole = await prisma.role.upsert({
        where: { name: "ADMIN" },
        update: {},
        create: { name: "ADMIN" },
    });

    const employeeRole = await prisma.role.upsert({
        where: { name: "EMPLOYEE" },
        update: {},
        create: { name: "EMPLOYEE" },
    });

    const userRole = await prisma.role.upsert({
        where: { name: "USER" },
        update: {},
        create: { name: "USER" },
    });

    // 2. Create permissions
    const permissionData = [
        {
            key: "user:read",
            description: "Read users",
        },
        {
            key: "user:create",
            description: "Create users",
        },
        {
            key: "role:read",
            description: "Read roles",
        },
        {
            key: "role:create",
            description: "Create roles",
        },
        {
            key: "role:update",
            description: "Update roles",
        },
        {
            key: "role:delete",
            description: "Delete roles",
        },
        {
            key: "permission:read",
            description: "Read permissions",
        },
    ];

    const permissions = await Promise.all(
        permissionData.map((permission) =>
            prisma.permission.upsert({
                where: {
                    key: permission.key,
                },
                update: {
                    description: permission.description,
                },
                create: permission,
            })
        )
    );

    const permissionMap = new Map(
        permissions.map((permission) => [
            permission.key,
            permission.id,
        ])
    );

    // 3. Assign permissions to ADMIN
    const adminPermissionKeys = [
        "user:read",
        "user:create",
        "role:read",
        "role:create",
        "role:update",
        "role:delete",
        "permission:read",
    ];

    await prisma.rolePermission.createMany({
        data: adminPermissionKeys.map((key) => ({
            roleId: adminRole.id,
            permissionId: permissionMap.get(key)!,
        })),
        skipDuplicates: true,
    });

    // 4. Assign permissions to EMPLOYEE
    await prisma.rolePermission.createMany({
        data: [
            {
                roleId: employeeRole.id,
                permissionId: permissionMap.get("user:read")!,
            },
        ],
        skipDuplicates: true,
    });

    // USER intentionally has no permissions

    // 5. Create test users
    const password = await bcrypt.hash("Password123!", 10);

    await prisma.user.upsert({
        where: {
            email: "admin@example.com",
        },
        update: {},
        create: {
            name: "Admin",
            email: "admin@example.com",
            password,
            roleId: adminRole.id,
        },
    });

    await prisma.user.upsert({
        where: {
            email: "employee@example.com",
        },
        update: {},
        create: {
            name: "Employee",
            email: "employee@example.com",
            password,
            roleId: employeeRole.id,
        },
    });

    await prisma.user.upsert({
        where: {
            email: "user@example.com",
        },
        update: {},
        create: {
            name: "User",
            email: "user@example.com",
            password,
            roleId: userRole.id,
        },
    });

    console.log("RBAC seed completed.");
};

main()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });