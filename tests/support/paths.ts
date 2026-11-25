// Absolute paths for tests that read files from the repository.
import path from "node:path";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const fromRoot = (...parts: string[]): string => path.resolve(ROOT, ...parts);
