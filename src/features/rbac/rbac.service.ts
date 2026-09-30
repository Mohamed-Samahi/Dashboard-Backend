import { prisma } from "../../config/db.js";
import { AppError } from "../../errors/AppError.js";

const getUserPermissions = async (userId: string): Promise<string[]> => {
    const user = await prisma.user.findUnique({
        where: {
            id: userId,
        },
        select: {
            role: {
                select: {
                    permissions: {
                        select: {
                            permission: {
                                select: {
                                    key: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });

    if (!user) {
        throw new AppError("User not found", 404);
    }

    return user.role.permissions.map(
        (rolePermission) => rolePermission.permission.key
    );
};

export { getUserPermissions };