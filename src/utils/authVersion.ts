import { redis } from "../config/redis.js";

const getAuthVersionKey = (userId: string) =>
    `auth:user:${userId}:version`;

const getAuthVersion = async (
    userId: string
): Promise<number | null> => {
    const version = await redis.get(getAuthVersionKey(userId));

    if (version === null) {
        return null;
    }

    return Number(version);
};

const setAuthVersion = async (
    userId: string,
    version: number
): Promise<void> => {
    await redis.set(
        getAuthVersionKey(userId),
        version.toString()
    );
};

const incrementAuthVersion = async (
    userId: string
): Promise<number> => {
    return redis.incr(getAuthVersionKey(userId));
};

export {
    getAuthVersion,
    setAuthVersion,
    incrementAuthVersion,
};