import winston from "winston";

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const logger = winston.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",

    format: combine(
        timestamp(),
        errors({ stack: true }),
        json()
    ),

    transports: [
        new winston.transports.File({
            filename: "logs/error.log",
            level: "error",
        }),

        new winston.transports.File({
            filename: "logs/combined.log",
        }),
    ],
});

// Human-readable logs during development
if (process.env.NODE_ENV !== "production") {
    logger.add(
        new winston.transports.Console({
            format: combine(
                colorize(),
                simple()
            ),
        })
    );
}

export default logger;