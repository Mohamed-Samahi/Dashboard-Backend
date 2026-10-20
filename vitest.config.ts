
import { defineConfig } from "vitest/config";
import { config } from "dotenv";

config({ path: ".env.test", override: true });

export default defineConfig({
    test: {
        environment: "node",

        include: ["tests/**/*.{test,spec}.ts"],

        globals: false,
        clearMocks: true,
        restoreMocks: true,

        setupFiles: ["./tests/setup/global.ts"],
        fileParallelism: false,

        coverage: {
            provider: "v8",

            reporter: [
                "text",
                "html",
                "lcov",
                "json-summary",
            ],

            reportsDirectory: "./coverage",

            include: ["src/**/*.ts"],

            exclude: [
                "src/generated/**",
                "src/server.ts",
                "**/*.d.ts",
                "**/*.test.ts",
                "**/*.spec.ts",
                "dist/**",
                "coverage/**",
                "node_modules/**",
                "prisma/**",
            ],

            thresholds: {
                statements: 70,
                branches: 50,
                functions: 65,
                lines: 70,
            },
        },
    },
});
