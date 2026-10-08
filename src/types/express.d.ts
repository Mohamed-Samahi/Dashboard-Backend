type AuthenticatedUser = {
    id: string;
    role: string;
    permissions: string[];
};

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
        }
    }
}

export { };