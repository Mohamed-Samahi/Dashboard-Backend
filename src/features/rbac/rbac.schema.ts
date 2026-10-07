import { z } from "zod";

const permissionArraySchema = z
    .array(z.string().trim().min(1))
    .superRefine((permissions, ctx) => {
        if (new Set(permissions).size !== permissions.length) {
            ctx.addIssue({
                code: "custom",
                message: "Duplicate permissions are not allowed",
            });
        }
    });

const createRoleSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Role name is required")
        .transform((value) => value.toUpperCase()),

    permissions: permissionArraySchema.default([]),
});

const updateRoleSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2, "Role name is required")
            .transform((value) => value.toUpperCase())
            .optional(),

        permissions: permissionArraySchema.optional(),
    })
    .refine(
        (data) =>
            data.name !== undefined ||
            data.permissions !== undefined,
        {
            message: "At least one field must be provided",
        }
    );

const roleParamsSchema = z.object({
    roleId: z.uuid("Invalid role ID"),
});

export {
    createRoleSchema,
    updateRoleSchema,
    roleParamsSchema,
};