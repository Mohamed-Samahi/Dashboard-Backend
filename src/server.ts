import "dotenv/config";

import app from "./app.js";

import {
    connectToDatabase,
    disconnectFromDatabase,
} from "./config/db.js";

import {
    connectToRedis,
    disconnectFromRedis,
} from "./config/redis.js";

import logger from "./config/logger.js";

const PORT = process.env.PORT || 5000;

process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
        error,
    });

    process.exit(1);
});

const startServer = async () => {
    try {
        await connectToDatabase();
        logger.info("Database connection established.");

        await connectToRedis();
        logger.info("Redis connection established.");

        const server = app.listen(PORT, () => {
            logger.info(`Server is running on port ${PORT}`);
        });

        process.on("unhandledRejection", (error) => {
            logger.error("Unhandled rejection", {
                error,
            });

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(1);
            });
        });

        process.on("SIGTERM", () => {
            logger.info("SIGTERM received. Shutting down gracefully...");

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(0);
            });
        });

        process.on("SIGINT", () => {
            logger.info("SIGINT received. Shutting down gracefully...");

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(0);
            });
        });
    } catch (error) {
        logger.error("Failed to start server", {
            error,
        });

        await disconnectFromRedis();
        await disconnectFromDatabase();

        process.exit(1);
    }
};

startServer();