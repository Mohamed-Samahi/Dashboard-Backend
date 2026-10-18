
import { beforeAll, beforeEach, afterAll } from "vitest";

import {
    prisma,
    connectToDatabase,
    disconnectFromDatabase,
} from "../../src/config/db.js";

import {
    redis,
    connectToRedis,
    disconnectFromRedis,
} from "../../src/config/redis.js";

import { assertTestEnvironment } from "./testGuard.js";

export function setupIntegrationTests() {
    beforeAll(async () => {
        assertTestEnvironment();

        await connectToDatabase();
        await connectToRedis();
    });

    beforeEach(async () => {
        assertTestEnvironment();

        const tables = await prisma.$queryRaw<
            { tablename: string }[]
        >`
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename != '_prisma_migrations'
        `;

        if (tables.length) {
            const names = tables
                .map(({ tablename }) =>
                    `"public"."${tablename.replaceAll('"', '""')}"`
                )
                .join(", ");

            await prisma.$executeRawUnsafe(
                `TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`
            );
        }

        await redis.flushDb();
    });

    afterAll(async () => {
        await disconnectFromRedis();
        await disconnectFromDatabase();
    });
}
