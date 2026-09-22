import "dotenv/config";

import app from "./app.js";
import {
    connectToDatabase,
    disconnectFromDatabase,
} from "./config/db.js";

const PORT = process.env.PORT || 5000;

// Handle synchronous uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
});

const startServer = async () => {
    try {
        // Ensure database is available before accepting HTTP requests
        await connectToDatabase();

        const server = app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

        // Handle unhandled promise rejections
        process.on("unhandledRejection", (error) => {
            console.error("Unhandled Rejection:", error);

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(1);
            });
        });

        // Graceful shutdown
        process.on("SIGTERM", () => {
            console.log("SIGTERM received. Shutting down gracefully...");

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(0);
            });
        });

        // Graceful shutdown when using Ctrl+C locally
        process.on("SIGINT", () => {
            console.log("SIGINT received. Shutting down gracefully...");

            server.close(async () => {
                await disconnectFromDatabase();
                process.exit(0);
            });
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        await disconnectFromDatabase();
        process.exit(1);
    }
};

startServer();