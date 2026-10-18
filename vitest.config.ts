
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

        coverage: {
            provider: "v8",
            reporter: ["text", "html"],
            reportsDirectory: "./coverage",
            include: ["src/**/*.ts"],
            exclude: [
                "src/generated/**",
                "src/server.ts",
                "**/*.d.ts",
            ],
        },

        setupFiles: ["./tests/setup/global.ts"],
        fileParallelism: false,
    },
});
