import jwt, { type SignOptions } from "jsonwebtoken";

import { randomUUID } from "node:crypto";

type AccessTokenPayload = {
    userId: string;
    roleId: string;
    role: string;
    permissions: string[];
    roleVersion: number;
    userVersion: number;
};

type RefreshTokenPayload = {
    userId: string;
    userVersion: number;
};

const generateAccessToken = (payload: AccessTokenPayload) => {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
        throw new Error("JWT_ACCESS_SECRET is not defined");
    }

    const expiresIn =
        process.env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];

    if (!expiresIn) {
        throw new Error("JWT_ACCESS_EXPIRES_IN is not defined");
    }

    return jwt.sign(payload, secret, {
        expiresIn,
    });
};

const generateRefreshToken = (payload: RefreshTokenPayload) => {
    const secret = process.env.JWT_REFRESH_SECRET;

    if (!secret) {
        throw new Error("JWT_REFRESH_SECRET is not defined");
    }

    const expiresIn = Number(
        process.env.JWT_REFRESH_EXPIRES_IN_SECONDS
    );

    if (!expiresIn || expiresIn <= 0) {
        throw new Error(
            "JWT_REFRESH_EXPIRES_IN_SECONDS is not defined or invalid"
        );
    }

    return jwt.sign(payload, secret, {
        expiresIn,
        jwtid: randomUUID(),
    });
};

const verifyAccessToken = (token: string): AccessTokenPayload => {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
        throw new Error("JWT_ACCESS_SECRET is not defined");
    }

    return jwt.verify(token, secret) as AccessTokenPayload;
};

const verifyRefreshToken = (
    token: string
): RefreshTokenPayload => {
    const secret = process.env.JWT_REFRESH_SECRET;

    if (!secret) {
        throw new Error("JWT_REFRESH_SECRET is not defined");
    }

    return jwt.verify(token, secret) as RefreshTokenPayload;
};

export {
    generateAccessToken,
    verifyAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
};

export type {
    AccessTokenPayload,
    RefreshTokenPayload,
};