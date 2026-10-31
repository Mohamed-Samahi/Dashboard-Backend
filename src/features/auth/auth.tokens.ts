import { generateAccessToken, generateRefreshToken } from "../../utils/jwt.js";
import { storeRefreshToken } from "../../utils/refreshToken.js";

type AuthenticatedUser = {
    id: string;
    authVersion: number;
    role: {
        id: string;
        name: string;
        authVersion: number;
        permissions: {
            permission: {
                key: string;
            };
        }[];
    };
};

const createUserAccessToken = (
    user: AuthenticatedUser
) => {
    const permissions = user.role.permissions.map(
        (rp) => rp.permission.key
    );

    return generateAccessToken({
        userId: user.id,
        roleId: user.role.id,
        role: user.role.name,
        permissions,
        roleVersion: user.role.authVersion,
        userVersion: user.authVersion,
    });
};

const createUserSession = async (
    user: AuthenticatedUser
) => {
    const accessToken = createUserAccessToken(user);

    const refreshToken = generateRefreshToken({
        userId: user.id,
        userVersion: user.authVersion,
    });

    await storeRefreshToken(user.id, refreshToken);

    return { accessToken, refreshToken };
};

export {
    createUserAccessToken,
    createUserSession
};