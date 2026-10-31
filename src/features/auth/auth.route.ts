import express from "express";

import {
    getMe,
    googleCallback,
    googleLogin,
    login,
    logout,
    refresh,
    register,
    forgotPassword,
    confirmPasswordReset,
    changePassword,
} from "./auth.controller.js";

import {
    changePasswordSchema,
    loginSchema,
    registerSchema,
} from "./auth.schema.js";

import {
    forgotPasswordSchema,
    resetPasswordSchema,
} from "./password-reset.schema.js";

import { validate } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post(
    "/register",
    validate(registerSchema),
    register
);

router.post(
    "/login",
    validate(loginSchema),
    login
);

router.get("/google", googleLogin);

router.get("/google/callback", googleCallback);

router.post("/refresh", refresh);

router.get("/me", authenticate, getMe);

router.post("/logout", logout);

router.post(
    "/forgot-password",
    validate(forgotPasswordSchema),
    forgotPassword
);

router.post(
    "/reset-password",
    validate(resetPasswordSchema),
    confirmPasswordReset
);

router.patch(
    "/change-password",
    authenticate,
    validate(changePasswordSchema),
    changePassword
);

export default router;