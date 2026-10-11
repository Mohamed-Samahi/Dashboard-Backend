import { redis } from "../config/redis.js";

const getRoleVersionKey = (roleId: string) =>
    `auth:role:${roleId}:version`;

const getRoleVersion = async (
    roleId: string
): Promise<number | null> => {
    const version = await redis.get(getRoleVersionKey(roleId));

    if (version === null) {
        return null;
    }

    return Number(version);
};

const setRoleVersion = async (
    roleId: string,
    version: number
): Promise<void> => {
    await redis.set(
        getRoleVersionKey(roleId),
        version.toString()
    );
};

const deleteRoleVersion = async (
    roleId: string
): Promise<void> => {
    await redis.del(getRoleVersionKey(roleId));
};

const getUserVersionKey = (userId: string) =>
    `auth:user:${userId}:version`;

const getUserVersion = async (
    userId: string
): Promise<number | null> => {
    const version = await redis.get(getUserVersionKey(userId));

    if (version === null) {
        return null;
    }

    return Number(version);
};

const setUserVersion = async (
    userId: string,
    version: number
): Promise<void> => {
    await redis.set(
        getUserVersionKey(userId),
        version.toString()
    );
};

export {
    getRoleVersion,
    setRoleVersion,
    deleteRoleVersion,
    getUserVersion,
    setUserVersion,
};