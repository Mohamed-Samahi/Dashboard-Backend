
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.test", override: true });

const db = new URL(process.env.DATABASE_URL ?? "");
const redis = new URL(process.env.REDIS_URL ?? "");

if (
    process.env.NODE_ENV !== "test" ||
    db.hostname !== "localhost" ||
    db.port !== "5434" ||
    db.pathname !== "/dashboard_test" ||
    redis.hostname !== "localhost" ||
    redis.port !== "6380"
) {
    throw new Error("Unsafe test environment: migration blocked");
}

const result = spawnSync(
    process.execPath,
    ["./node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
        stdio: "inherit",
        env: process.env,
    }
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
