import express from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";
import { authorize } from "../../middlewares/authorize.middleware.js";

import { validate } from "../../middlewares/validate.middleware.js";

import {
    createNewRole,
    deleteExistingRole,
    getAllPermissions,
    getAllRoles,
    updateExistingRole
} from "./rbac.controller.js";

import { createRoleSchema, updateRoleSchema } from "./rbac.schema.js";

const router = express.Router();

router.use(authenticate);

router.get(
    "/permissions",
    authorize("permission:read"),
    getAllPermissions
);

router.get(
    "/roles",
    authorize("role:read"),
    getAllRoles
);

router.post(
    "/roles",
    authorize("role:create"),
    validate(createRoleSchema),
    createNewRole
);

router.patch(
    "/roles/:roleId",
    authorize("role:update"),
    validate(updateRoleSchema),
    updateExistingRole
);

router.delete(
    "/roles/:roleId",
    authorize("role:delete"),
    deleteExistingRole
);

export default router;