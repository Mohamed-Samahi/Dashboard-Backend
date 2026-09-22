import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

import bcrypt from "bcryptjs";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

async function main() {
    const password = await bcrypt.hash("Password123!", 10);

    await prisma.user.createMany({
        data: [
            {
                name: "User One",
                email: "user1@example.com",
                password,
            },
            {
                name: "User Two",
                email: "user2@example.com",
                password,
            },
        ],
        skipDuplicates: true,
    });
}

main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });