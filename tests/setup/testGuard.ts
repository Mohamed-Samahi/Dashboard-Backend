
export function assertTestEnvironment() {
    const { NODE_ENV, DATABASE_URL, REDIS_URL } = process.env;

    if (!DATABASE_URL || !REDIS_URL) {
        throw new Error(
            "Missing DATABASE_URL or REDIS_URL. Check .env.test"
        );
    }

    const db = new URL(DATABASE_URL);
    const redis = new URL(REDIS_URL);

    if (
        NODE_ENV !== "test" ||
        db.hostname !== "localhost" ||
        db.port !== "5434" ||
        db.pathname !== "/dashboard_test" ||
        redis.hostname !== "localhost" ||
        redis.port !== "6380"
    ) {
        throw new Error(
            "Unsafe test environment: expected test PostgreSQL (:5434/dashboard_test) and Redis (:6380)"
        );
    }
}

assertTestEnvironment();
