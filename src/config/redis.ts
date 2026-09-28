import { createClient } from "redis";

const redis = createClient({
    url: process.env.REDIS_URL as string,
});

const connectToRedis = async () => {
    await redis.connect();
};

const disconnectFromRedis = async () => {
    if (redis.isOpen) {
        await redis.quit();
    }
};

export {
    redis,
    connectToRedis,
    disconnectFromRedis,
};