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

    // 2. Create test permissions
    const userRead = await prisma.permission.upsert({
        where: { key: "user:read" },
        update: {},
        create: {
            key: "user:read",
            description: "Read users",
        },
    });

    const userCreate = await prisma.permission.upsert({
        where: { key: "user:create" },
        update: {},
        create: {
            key: "user:create",
            description: "Create users",
        },
    });

    // 3. Assign permissions to roles
    await prisma.rolePermission.createMany({
        data: [
            // ADMIN
            { roleId: adminRole.id, permissionId: userRead.id },
            { roleId: adminRole.id, permissionId: userCreate.id },

            // EMPLOYEE
            { roleId: employeeRole.id, permissionId: userRead.id },
        ],
        skipDuplicates: true,
    });

    // 4. Create test users
    const password = await bcrypt.hash("Password123!", 10);

    await prisma.user.upsert({
        where: { email: "admin@example.com" },
        update: {},
        create: {
            name: "Admin",
            email: "admin@example.com",
            password,
            roleId: adminRole.id,
        },
    });

    await prisma.user.upsert({
        where: { email: "employee@example.com" },
        update: {},
        create: {
            name: "Employee",
            email: "employee@example.com",
            password,
            roleId: employeeRole.id,
        },
    });

    await prisma.user.upsert({
        where: { email: "user@example.com" },
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