// PrismaClient is loaded dynamically to support installations whose generated
// Prisma client does not expose it through the package's type declarations.

import { PrismaClient } from "../generated/prisma/client.js";

import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "info", "warn", "error"] : ["error"],
});

const connectToDatabase = async () => {
    try {
        await prisma.$connect();

        console.log("Connected to the database via prisma client.");
    } catch (error) {
        console.error("Error connecting to the database:", error);

        process.exit(1); // Exit the process with an error code
    }
}

const disconnectFromDatabase = async () => {
    try {
        await prisma.$disconnect();
    } catch (error) {
        console.error("Error disconnecting from the database:", error);
    }
}

export { prisma, connectToDatabase, disconnectFromDatabase };