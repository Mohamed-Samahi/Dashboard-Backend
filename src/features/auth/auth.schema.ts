import { z } from "zod";

export const registerSchema = z.object({
    name: z.string().min(2).optional(),
    email: z.email(),
    password: z.string().min(8),
});

export const loginSchema = z.object({
    email: z.email(),
    password: z.string().min(1),
});

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string()
        .min(8)
        .refine(
            (password) =>
                Buffer.byteLength(password, "utf8") <= 72,
            "Password must not exceed 72 UTF-8 bytes"
        ),
}).strict().refine(
    (data) => data.currentPassword !== data.newPassword,
    {
        message: "New password must differ from current password",
        path: ["newPassword"],
    }
);

export type ChangePasswordData = z.infer<
    typeof changePasswordSchema
>;

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;