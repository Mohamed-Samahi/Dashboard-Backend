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

export {
    getRoleVersion,
    setRoleVersion,
};