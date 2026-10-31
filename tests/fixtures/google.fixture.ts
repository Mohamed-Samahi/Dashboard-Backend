const googleIdentityFixture = {
    provider: "google" as const,
    providerAccountId: "google-user-123",
    email: "google-user@example.com",
    name: "Google Test User",
};

const googleTokenPayloadFixture = {
    sub: googleIdentityFixture.providerAccountId,
    email: googleIdentityFixture.email,
    email_verified: true,
    name: googleIdentityFixture.name,
};

const googleTokensFixture = {
    access_token: "mock-google-access-token",
    id_token: "mock-google-id-token",
};

export {
    googleIdentityFixture,
    googleTokenPayloadFixture,
    googleTokensFixture,
}