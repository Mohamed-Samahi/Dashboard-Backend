import { beforeAll, afterEach, afterAll, vi } from "vitest";
import { assertTestEnvironment } from "./testGuard.js";

beforeAll(() => {
    assertTestEnvironment();
});

afterEach(() => {
    vi.clearAllMocks();
});

afterAll(() => {
    vi.restoreAllMocks();
});