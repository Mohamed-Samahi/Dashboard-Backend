import { z } from "zod";

export const forgotPasswordSchema = z.object({
    email: z.email().trim().toLowerCase(),
}).strict();

export const resetPasswordSchema = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i),
    newPassword: z.string().min(8).max(72),
}).strict();

export type ForgotPasswordData = z.infer<
    typeof forgotPasswordSchema
>;

export type ResetPasswordData = z.infer<
    typeof resetPasswordSchema
>;
