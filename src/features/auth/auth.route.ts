import express from "express";

import {
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

const router = express.Router();

router.post("/register", validate(registerSchema), register);

router.post("/login", validate(loginSchema), login);

router.post("/logout", logout);

router.post("/refresh", refresh);

export default router;