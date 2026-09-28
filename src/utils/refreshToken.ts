import crypto from "node:crypto";

import { redis } from "../config/redis.js";

const getRefreshTokenTTL = () => {
    const ttl = Number(
        process.env.JWT_REFRESH_EXPIRES_IN_SECONDS
    );

    if (!ttl || ttl <= 0) {
        throw new Error(
            "JWT_REFRESH_EXPIRES_IN_SECONDS is not defined or invalid"
        );
    }

    return ttl;
};

const hashRefreshToken = (token: string) => {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
};

const storeRefreshToken = async (
    userId: string,
    refreshToken: string
) => {
    const tokenHash = hashRefreshToken(refreshToken);

    await redis.set(
        `refresh_token:${tokenHash}`,
        userId,
        {
            expiration: {
                type: "EX",
                value: getRefreshTokenTTL(),
            },
        }
    );
};

const getRefreshTokenUser = async (
    refreshToken: string
): Promise<string | null> => {
    const tokenHash = hashRefreshToken(refreshToken);

    return redis.get(`refresh_token:${tokenHash}`);
};

const deleteRefreshToken = async (
    refreshToken: string
) => {
    const tokenHash = hashRefreshToken(refreshToken);

    await redis.del(`refresh_token:${tokenHash}`);
};

export {
    hashRefreshToken,
    storeRefreshToken,
    getRefreshTokenUser,
    deleteRefreshToken,
};