import {
    createHash,
    randomBytes,
    timingSafeEqual
} from "node:crypto";

import { googleOAuthClient } from "../../../config/google-oauth.js";

import { redis } from "../../../config/redis.js";

import { GaxiosError } from "gaxios";

import { AppError } from "../../../errors/AppError.js";

import { z } from "zod";

export type GoogleIdentity = {
    provider: "google";
    providerAccountId: string;
    email: string;
    name: string | null;
};

const generateGoogleAuthUrl = () => {
    const state = randomBytes(32).toString("hex");

    const url = googleOAuthClient.generateAuthUrl({
        access_type: "online",
        scope: ["openid", "email", "profile"],
        state,
    });

    return { url, state };
};

const storeGoogleOAuthState = async (state: string) => {
    const hashedState = createHash("sha256")
        .update(state)
        .digest("hex");

    await redis.set(
        `oauth:google:state:${hashedState}`,
        "pending",
        { EX: 300 }
    );
};

const validateGoogleOAuthState = async (
    receivedState: string,
    cookieState: string | undefined
) => {
    if (!cookieState) {
        throw new AppError("Invalid OAuth state", 400);
    }

    const received = Buffer.from(receivedState);
    const expected = Buffer.from(cookieState);

    if (
        received.length !== expected.length ||
        !timingSafeEqual(received, expected)
    ) {
        throw new AppError("Invalid OAuth state", 400);
    }

    const hashedState = createHash("sha256")
        .update(receivedState)
        .digest("hex");

    const storedState = await redis.getDel(
        `oauth:google:state:${hashedState}`
    );

    if (storedState !== "pending") {
        throw new AppError("OAuth state expired or already used", 400);
    }
};

const exchangeGoogleAuthCode = async (code: string) => {
    try {
        const { tokens } = await googleOAuthClient.getToken(code);

        if (!tokens.id_token) {
            throw new AppError("Google ID token is missing", 401);
        }

        return tokens;
    } catch (error) {
        if (
            error instanceof GaxiosError &&
            error.response?.status === 400 &&
            error.response.data?.error === "invalid_grant"
        ) {
            throw new AppError(
                "Google authorization code is invalid or expired",
                400
            );
        }

        throw error;
    }
};

const verifyGoogleIdToken = async (idToken: string) => {
    try {
        const ticket = await googleOAuthClient.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID!,
        });

        const payload = ticket.getPayload();

        if (!payload) {
            throw new AppError("Invalid Google ID token", 401);
        }

        return payload;
    } catch (error) {
        if (error instanceof AppError) {
            throw error;
        }

        // Log unexpected verification errors internally if needed.
        throw new AppError("Invalid Google ID token", 401);
    }
};

const googleIdentitySchema = z.object({
    sub: z.string().min(1),
    email: z.email(),
    email_verified: z.literal(true),
    name: z.string().nullish(),
});

const getGoogleIdentity = async (
    idToken: string
): Promise<GoogleIdentity> => {
    const payload = await verifyGoogleIdToken(idToken);

    const result = googleIdentitySchema.safeParse(payload);

    if (!result.success) {
        throw new AppError(
            "Google account identity is invalid or email is not verified",
            401
        );
    }

    return {
        provider: "google",
        providerAccountId: result.data.sub,
        email: result.data.email,
        name: result.data.name ?? null,
    };
};

export {
    generateGoogleAuthUrl,
    storeGoogleOAuthState,
    validateGoogleOAuthState,
    exchangeGoogleAuthCode,
    verifyGoogleIdToken,
    getGoogleIdentity,
};