import {
    createHash,
    randomBytes,
} from "node:crypto";
import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { redis } from "../../config/redis.js";
import logger from "../../config/logger.js";

import { AppError } from "../../errors/AppError.js";
import { sendEmail } from "../../utils/email.js";
import { setUserVersion } from "../../utils/authVersion.js";

import type {
    ForgotPasswordData,
    ResetPasswordData,
} from "./password-reset.schema.js";

const RESET_TTL_MS = 15 * 60 * 1000;

const INVALID_TOKEN_MESSAGE =
    "Invalid or expired password reset token";

const hashValue = (value: string): string =>
    createHash("sha256").update(value).digest("hex");

const generateResetToken = (): string =>
    randomBytes(32).toString("hex");

const getFrontendUrl = (): URL => {
    const configuredUrl = process.env.FRONTEND_URL;

    if (!configuredUrl) {
        throw new Error("FRONTEND_URL is not configured");
    }

    const url = new URL(configuredUrl);

    if (
        url.username ||
        url.password ||
        (url.protocol !== "https:" &&
            !(process.env.NODE_ENV !== "production" &&
                url.hostname === "localhost"))
    ) {
        throw new Error("Invalid FRONTEND_URL");
    }

    return url;
};

// Limit traffic by source IP.
// Fixed 60-second window: up to 10 requests.
const enforceIpLimit = async (
    ip: string
): Promise<void> => {
    const key = `rate:password-reset:ip:${hashValue(ip)}`;

    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, 60);
    }

    if (count > 10) {
        throw new AppError(
            "Too many requests. Please try again later.",
            429
        );
    }
};

// One reset request per email per 60 seconds.
// Applies to both registered and unregistered emails.
const acquireEmailCooldown = async (
    email: string
): Promise<boolean> => {
    const key =
        `rate:password-reset:email:${hashValue(email)}`;

    const result = await redis.set(key, "1", {
        expiration: {
            type: "EX",
            value: 60,
        },
        condition: "NX",
    });

    return result === "OK";
};

const requestPasswordReset = async (
    data: ForgotPasswordData,
    ip: string
): Promise<void> => {
    await enforceIpLimit(ip);

    const email = data.email;

    const allowed = await acquireEmailCooldown(email);

    // Always return a generic response from the controller.
    if (!allowed) return;

    const user = await prisma.user.findUnique({
        where: { email },
        select: {
            id: true,
            email: true,
            password: true,
        },
    });

    // Do not disclose whether the account exists
    // or uses Google-only authentication.
    if (!user?.password) return;

    const token = generateResetToken();
    const tokenHash = hashValue(token);

    const expiresAt = new Date(
        Date.now() + RESET_TTL_MS
    );

    await prisma.passwordResetToken.create({
        data: {
            tokenHash,
            userId: user.id,
            expiresAt,
        },
    });

    const resetUrl = getFrontendUrl();
    resetUrl.pathname = "/reset-password";
    resetUrl.search = "";
    resetUrl.hash = "";
    resetUrl.searchParams.set("token", token);

    try {
        await sendEmail(
            user.email,
            "Reset your password",
            [
                "We received a request to reset your password.",
                "",
                `Reset your password: ${resetUrl.toString()}`,
                "",
                "This link expires in 15 minutes.",
                "If you didn't request this, ignore this email.",
            ].join("\n")
        );
    } catch (error) {
        // Avoid leaving a usable token if sending failed.
        await prisma.passwordResetToken.deleteMany({
            where: { tokenHash },
        });

        logger.error("Password reset email delivery failed", {
            error,
        });

        // Do not disclose email delivery/account status.
    }
};

const resetPassword = async (
    data: ResetPasswordData
): Promise<void> => {
    const tokenHash = hashValue(
        data.token.toLowerCase()
    );

    // Hash outside the transaction to minimize lock time.
    const hashedPassword = await bcrypt.hash(
        data.newPassword,
        10
    );

    const result = await prisma.$transaction(
        async (tx) => {
            const now = new Date();

            // Atomically claim an unused, unexpired token.
            const claim = await tx.passwordResetToken.updateMany({
                where: {
                    tokenHash,
                    usedAt: null,
                    expiresAt: { gt: now },
                },
                data: {
                    usedAt: now,
                },
            });

            if (claim.count !== 1) {
                throw new AppError(
                    INVALID_TOKEN_MESSAGE,
                    400
                );
            }

            const record = await tx.passwordResetToken.findUniqueOrThrow({
                where: { tokenHash },
                select: { userId: true },
            });

            const user = await tx.user.update({
                where: { id: record.userId },
                data: {
                    password: hashedPassword,
                    authVersion: {
                        increment: 1,
                    },
                },
                select: {
                    id: true,
                    email: true,
                    authVersion: true,
                },
            });

            // Invalidate all other reset tokens for this user.
            await tx.passwordResetToken.updateMany({
                where: {
                    userId: user.id,
                    usedAt: null,
                },
                data: { usedAt: now },
            });

            return user;
        }
    );

    // Synchronize the Redis authentication-version cache.
    await setUserVersion(
        result.id,
        result.authVersion
    );

    // Password reset does not automatically log in the user.
    try {
        await sendEmail(
            result.email,
            "Your password was changed",
            [
                "Your account password was reset successfully.",
                "",
                "If you made this change, no further action is needed.",
                "If you did not request this change, contact support immediately.",
            ].join("\n")
        );
    } catch (error) {
        logger.error(
            "Password reset security notification failed",
            { error }
        );
    }
};

const enforceResetAttemptLimit = async (
    ip: string
): Promise<void> => {
    const key = `rate:password-reset:attempt:${hashValue(ip)}`;

    const count = await redis.incr(key);

    if (count === 1) {
        await redis.expire(key, 60);
    }

    if (count > 10) {
        throw new AppError(
            "Too many reset attempts. Please try again later.",
            429
        );
    }
};

export {
    requestPasswordReset,
    resetPassword,
    enforceResetAttemptLimit,
};
