import express from "express";

import {
    getMe,
    login,
    logout,
    refresh,
    register,
} from "./auth.controller.js";

import {
    loginSchema,
    registerSchema,
} from "./auth.schema.js";

import { validate } from "../../middlewares/validate.middleware.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.post("/register", validate(registerSchema), register);

router.post("/login", validate(loginSchema), login);

router.post("/refresh", refresh);

router.get("/me", authenticate, getMe);

router.post("/logout", logout);

export default router;