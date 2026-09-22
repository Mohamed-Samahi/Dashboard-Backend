import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
    adapter,
    log:
        process.env.NODE_ENV === "development"
            ? ["query", "info", "warn", "error"]
            : ["error"],
});

const connectToDatabase = async () => {
    await prisma.$connect();
};

const disconnectFromDatabase = async () => {
    await prisma.$disconnect();
};

export {
    prisma,
    connectToDatabase,
    disconnectFromDatabase,
};