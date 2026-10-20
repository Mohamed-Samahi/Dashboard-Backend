import jwt from "jsonwebtoken";
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    type AccessTokenPayload,
} from "../../../src/utils/jwt.js";

const accessPayload: AccessTokenPayload = {
    userId: "user-123",
    roleId: "role-123",
    role: "ADMIN",
    permissions: ["user:read", "user:create"],
    roleVersion: 1,
    userVersion: 1,
};

const refreshPayload = {
    userId: "user-123",
};

describe("JWT Utilities", () => {
    beforeEach(() => {
        vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret");
        vi.stubEnv("JWT_REFRESH_SECRET", "test-refresh-secret");
        vi.stubEnv("JWT_ACCESS_EXPIRES_IN", "15m");
        vi.stubEnv("JWT_REFRESH_EXPIRES_IN_SECONDS", "604800");
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    describe("Access Tokens", () => {
        it("should generate a valid JWT", () => {
            const token = generateAccessToken(accessPayload);

            expect(token).toEqual(expect.any(String));
            expect(token.split(".")).toHaveLength(3);
        });

        it("should verify and return the correct payload", () => {
            const token = generateAccessToken(accessPayload);

            const decoded = verifyAccessToken(token);

            expect(decoded).toMatchObject(accessPayload);
        });

        it("should set the correct expiration", () => {
            const token = generateAccessToken(accessPayload);

            const decoded = jwt.decode(token) as jwt.JwtPayload;

            expect(decoded.exp! - decoded.iat!).toBe(900);
        });

        it("should reject an expired access token", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

            const token = generateAccessToken(accessPayload);

            vi.advanceTimersByTime(16 * 60 * 1000);

            expect(() => verifyAccessToken(token)).toThrow(
                jwt.TokenExpiredError
            );
        });

        it("should reject tokens signed with an incorrect secret", () => {
            const token = jwt.sign(
                accessPayload,
                "incorrect-secret",
                { expiresIn: "15m" }
            );

            expect(() => verifyAccessToken(token)).toThrow(
                jwt.JsonWebTokenError
            );
        });

        it("should reject malformed tokens", () => {
            expect(() =>
                verifyAccessToken("invalid.jwt.token")
            ).toThrow(jwt.JsonWebTokenError);
        });

        it("should reject generation without required configuration", () => {
            vi.stubEnv("JWT_ACCESS_SECRET", "");

            expect(() =>
                generateAccessToken(accessPayload)
            ).toThrow("JWT_ACCESS_SECRET is not defined");

            vi.stubEnv("JWT_ACCESS_SECRET", "test-access-secret");
            vi.stubEnv("JWT_ACCESS_EXPIRES_IN", "");

            expect(() =>
                generateAccessToken(accessPayload)
            ).toThrow("JWT_ACCESS_EXPIRES_IN is not defined");
        });
    });

    describe("Refresh Tokens", () => {
        it("should generate and verify a refresh token", () => {
            const token = generateRefreshToken(refreshPayload);

            const decoded = verifyRefreshToken(token);

            expect(decoded.userId).toBe(refreshPayload.userId);
            expect(decoded).toHaveProperty("jti");
        });

        it("should generate unique refresh tokens", () => {
            const firstToken = generateRefreshToken(refreshPayload);
            const secondToken = generateRefreshToken(refreshPayload);

            expect(firstToken).not.toBe(secondToken);

            const first = jwt.decode(firstToken) as jwt.JwtPayload;
            const second = jwt.decode(secondToken) as jwt.JwtPayload;

            expect(first.jti).not.toBe(second.jti);
        });

        it("should set the correct refresh token expiration", () => {
            const token = generateRefreshToken(refreshPayload);

            const decoded = jwt.decode(token) as jwt.JwtPayload;

            expect(decoded.exp! - decoded.iat!).toBe(604800);
        });

        it("should reject expired refresh tokens", () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

            const token = generateRefreshToken(refreshPayload);

            vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

            expect(() => verifyRefreshToken(token)).toThrow(
                jwt.TokenExpiredError
            );
        });

        it("should reject invalid refresh token configuration", () => {
            vi.stubEnv("JWT_REFRESH_EXPIRES_IN_SECONDS", "0");

            expect(() =>
                generateRefreshToken(refreshPayload)
            ).toThrow(
                "JWT_REFRESH_EXPIRES_IN_SECONDS is not defined or invalid"
            );
        });

        it("should prevent cross-verification between token secrets", () => {
            const accessToken = generateAccessToken(accessPayload);
            const refreshToken = generateRefreshToken(refreshPayload);

            expect(() =>
                verifyRefreshToken(accessToken)
            ).toThrow(jwt.JsonWebTokenError);

            expect(() =>
                verifyAccessToken(refreshToken)
            ).toThrow(jwt.JsonWebTokenError);
        });

        it("should reject verification without required secrets", () => {
            const accessToken = generateAccessToken(accessPayload);
            const refreshToken = generateRefreshToken(refreshPayload);

            vi.stubEnv("JWT_ACCESS_SECRET", "");

            expect(() =>
                verifyAccessToken(accessToken)
            ).toThrow("JWT_ACCESS_SECRET is not defined");

            vi.stubEnv("JWT_REFRESH_SECRET", "");

            expect(() =>
                verifyRefreshToken(refreshToken)
            ).toThrow("JWT_REFRESH_SECRET is not defined");
        });
    });
});
