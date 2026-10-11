import { prisma } from "../../config/db.js";
import { AppError } from "../../errors/AppError.js";

import {
    deleteRoleVersion,
    setRoleVersion,
    setUserVersion,
} from "../../utils/authVersion.js";

const getPermissions = async () => {
    return prisma.permission.findMany({
        select: {
            id: true,
            key: true,
            description: true,
        },
        orderBy: {
            key: "asc",
        },
    });
};

const getRoles = async () => {
    const roles = await prisma.role.findMany({
        select: {
            id: true,
            name: true,
            permissions: {
                select: {
                    permission: {
                        select: {
                            key: true,
                            description: true,
                        },
                    },
                },
            },
        },
        orderBy: {
            name: "asc",
        },
    });

    return roles.map((role) => ({
        id: role.id,
        name: role.name,
        permissions: role.permissions.map(
            (rolePermission) => rolePermission.permission
        ),
    }));
};

type CreateRoleData = {
    name: string;
    permissions: string[];
};

const createRole = async (data: CreateRoleData) => {
    const existingRole = await prisma.role.findUnique({
        where: {
            name: data.name,
        },
    });

    if (existingRole) {
        throw new AppError("Role already exists", 409);
    }

    const permissions = await prisma.permission.findMany({
        where: {
            key: {
                in: data.permissions,
            },
        },
        select: {
            id: true,
            key: true,
        },
    });

    if (permissions.length !== data.permissions.length) {
        throw new AppError(
            "One or more permissions do not exist",
            400
        );
    }

    return prisma.role.create({
        data: {
            name: data.name,
            permissions: {
                create: permissions.map((permission) => ({
                    permissionId: permission.id,
                })),
            },
        },
        select: {
            id: true,
            name: true,
            permissions: {
                select: {
                    permission: {
                        select: {
                            key: true,
                            description: true,
                        },
                    },
                },
            },
        },
    });
};

type UpdateRoleData = {
    name?: string;
    permissions?: string[];
};

const updateRole = async (
    roleId: string,
    data: UpdateRoleData
) => {
    const role = await prisma.role.findUnique({
        where: {
            id: roleId,
        },
    });

    if (!role) {
        throw new AppError("Role not found", 404);
    }

    if (data.name && data.name !== role.name) {
        const existingRole = await prisma.role.findUnique({
            where: {
                name: data.name,
            },
        });

        if (existingRole) {
            throw new AppError("Role already exists", 409);
        }
    }

    let permissions:
        | { id: string; key: string }[]
        | undefined;

    if (data.permissions !== undefined) {
        permissions = await prisma.permission.findMany({
            where: {
                key: {
                    in: data.permissions,
                },
            },
            select: {
                id: true,
                key: true,
            },
        });

        if (permissions.length !== data.permissions.length) {
            throw new AppError(
                "One or more permissions do not exist",
                400
            );
        }
    }

    const updatedRole = await prisma.$transaction(async (tx) => {
        if (permissions !== undefined) {
            await tx.rolePermission.deleteMany({
                where: {
                    roleId,
                },
            });

            if (permissions.length > 0) {
                await tx.rolePermission.createMany({
                    data: permissions.map((permission) => ({
                        roleId,
                        permissionId: permission.id,
                    })),
                });
            }
        }

        return tx.role.update({
            where: {
                id: roleId,
            },
            data: {
                ...(data.name !== undefined && {
                    name: data.name,
                }),
                authVersion: {
                    increment: 1,
                },
            },
            select: {
                id: true,
                name: true,
                authVersion: true,
                permissions: {
                    select: {
                        permission: {
                            select: {
                                key: true,
                                description: true,
                            },
                        },
                    },
                },
            },
        });
    });

    await setRoleVersion(
        updatedRole.id,
        updatedRole.authVersion
    );

    return updatedRole;
};

const deleteRole = async (roleId: string) => {
    const defaultRoleName = process.env.DEFAULT_USER_ROLE;

    if (!defaultRoleName) {
        throw new Error("DEFAULT_USER_ROLE is not defined");
    }

    const [role, defaultRole] = await Promise.all([
        prisma.role.findUnique({
            where: { id: roleId },
        }),
        prisma.role.findUnique({
            where: { name: defaultRoleName },
        }),
    ]);

    if (!role) {
        throw new AppError("Role not found", 404);
    }

    if (!defaultRole) {
        throw new AppError(
            `Default role '${defaultRoleName}' is not configured`,
            500
        );
    }

    if (role.id === defaultRole.id) {
        throw new AppError(
            "The default role cannot be deleted",
            409
        );
    }

    await prisma.$transaction(async (tx) => {
        // Move all affected users to the default role
        await tx.user.updateMany({
            where: {
                roleId: role.id,
            },
            data: {
                roleId: defaultRole.id,
            },
        });

        // RolePermission records are removed automatically by cascade
        await tx.role.delete({
            where: {
                id: role.id,
            },
        });
    });

    await deleteRoleVersion(role.id);
};

const assignUserRole = async (
    userId: string,
    roleId: string
) => {
    const [user, role] = await Promise.all([
        prisma.user.findUnique({
            where: {
                id: userId,
            },
        }),
        prisma.role.findUnique({
            where: {
                id: roleId,
            },
        }),
    ]);

    if (!user) {
        throw new AppError("User not found", 404);
    }

    if (!role) {
        throw new AppError("Role not found", 404);
    }

    if (user.roleId === roleId) {
        throw new AppError("User already has this role", 409);
    }

    const updatedUser = await prisma.user.update({
        where: {
            id: userId,
        },
        data: {
            roleId,
            authVersion: {
                increment: 1,
            },
        },
        select: {
            id: true,
            name: true,
            email: true,
            authVersion: true,
            role: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    await setUserVersion(
        updatedUser.id,
        updatedUser.authVersion
    );

    return updatedUser;
};

const getUsers = async () => {
    return prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: {
                select: {
                    id: true,
                    name: true,
                },
            },
            createdAt: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });
};

export {
    getPermissions,
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    assignUserRole,
    getUsers,
};