import type { Request, Response } from "express";

import {
    createRole,
    deleteRole,
    getPermissions,
    getRoles,
    updateRole,
    assignUserRole,
    getUsers,
} from "./rbac.service.js";

const getAllPermissions = async (_request: Request, response: Response) => {
    const permissions = await getPermissions();

    return response.status(200).json({
        data: permissions,
    });
};

const getAllRoles = async (_request: Request, response: Response) => {
    const roles = await getRoles();

    return response.status(200).json({
        data: roles,
    });
};

const createNewRole = async (request: Request, response: Response) => {
    const role = await createRole(request.body);

    return response.status(201).json({
        data: role,
    });
};

const updateExistingRole = async (request: Request<{ roleId: string }>, response: Response) => {
    const role = await updateRole(
        request.params.roleId,
        request.body
    );

    return response.status(200).json({
        data: role,
    });
};

const deleteExistingRole = async (request: Request<{ roleId: string }>, response: Response) => {
    await deleteRole(request.params.roleId);

    return response.status(204).send();
};

const assignRoleToUser = async (
    request: Request,
    response: Response
) => {
    const { userId } = request.params;
    const { roleId } = request.body;

    const user = await assignUserRole(
        userId as string,
        roleId
    );

    return response.status(200).json({
        data: user,
    });
};

const getAllUsers = async (
    _request: Request,
    response: Response
) => {
    const users = await getUsers();

    return response.status(200).json({
        data: users,
    });
};

export {
    getAllPermissions,
    getAllRoles,
    createNewRole,
    updateExistingRole,
    deleteExistingRole,
    assignRoleToUser,
    getAllUsers,
};