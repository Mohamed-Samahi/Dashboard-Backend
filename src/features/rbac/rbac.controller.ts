import type { Request, Response } from "express";

import {
    createRole,
    deleteRole,
    getPermissions,
    getRoles,
    updateRole
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

export {
    getAllPermissions,
    getAllRoles,
    createNewRole,
    updateExistingRole,
    deleteExistingRole,
};