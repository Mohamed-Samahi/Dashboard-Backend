import bcrypt from "bcryptjs";

import { prisma } from "../../config/db.js";
import { AppError } from "../../errors/AppError.js";

import type { LoginData, RegisterData } from "./auth.schema.js";

const findUserByEmail = async (email: string) => {
    return prisma.user.findUnique({
        where: { email },
    });
};

const registerUser = async (data: RegisterData) => {
    const existingUser = await findUserByEmail(data.email);

    if (existingUser) {
        throw new AppError("User already exists", 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return prisma.user.create({
        data: {
            name: data.name ?? null,
            email: data.email,
            password: hashedPassword,
        },
    });
};

const loginUser = async (data: LoginData) => {
    const user = await findUserByEmail(data.email);

    if (!user) {
        throw new AppError("Invalid credentials", 401);
    }

    const isPasswordValid = await bcrypt.compare(
        data.password,
        user.password
    );

    if (!isPasswordValid) {
        throw new AppError("Invalid credentials", 401);
    }

    // JWT will be generated here later
    return user;
};

export {
    registerUser,
    loginUser,
};