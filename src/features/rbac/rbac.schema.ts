import { z } from "zod";

const createRoleSchema = z.object({
    name: z
        .string()
        .trim()
        .min(2, "Role name is required")
        .transform((value) => value.toUpperCase()),

    permissions: z
        .array(z.string().trim().min(1))
        .default([]),
});

const updateRoleSchema = z
    .object({
        name: z
            .string()
            .trim()
            .min(2)
            .transform((value) => value.toUpperCase())
            .optional(),

        permissions: z
            .array(z.string().trim().min(1))
            .optional(),
    })
    .refine(
        (data) =>
            data.name !== undefined ||
            data.permissions !== undefined,
        {
            message: "At least one field must be provided",
        }
    );

export {
    createRoleSchema,
    updateRoleSchema,
};