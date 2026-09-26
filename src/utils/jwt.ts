import jwt, { type SignOptions } from "jsonwebtoken";

export type AccessTokenPayload = {
    userId: string;
    name: string | null;
    role: string;
};

const generateAccessToken = (payload: AccessTokenPayload) => {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
        throw new Error("JWT_ACCESS_SECRET is not defined");
    }

    const expiresIn = process.env.JWT_ACCESS_EXPIRES_IN as SignOptions["expiresIn"];

    if (!expiresIn) {
        throw new Error("JWT_ACCESS_EXPIRES_IN is not defined");
    }

    return jwt.sign(payload, secret, {
        expiresIn,
    });
};

const verifyAccessToken = (token: string): AccessTokenPayload => {
    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
        throw new Error("JWT_ACCESS_SECRET is not defined");
    }

    return jwt.verify(token, secret) as AccessTokenPayload;
};

export {
    generateAccessToken,
    verifyAccessToken,
};