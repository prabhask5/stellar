import { accessSync, constants, mkdirSync } from "node:fs";
import path from "node:path";

let cached: string | null = null;

/**
 * Where config and generated secrets live. `/data` in the container (a mounted
 * volume); `STELLAR_DATA_DIR` overrides it; local development falls back to
 * `.data` beside the app when `/data` is not writable.
 */
export function dataDir(): string {
  if (cached) return cached;
  const local = `${/* turbopackIgnore: true */ process.cwd()}${path.sep}.data`;
  const candidates = [process.env.STELLAR_DATA_DIR, "/data", local].filter((c): c is string =>
    Boolean(c),
  );
  for (const dir of candidates) {
    try {
      mkdirSync(dir, { recursive: true });
      accessSync(dir, constants.W_OK);
      cached = dir;
      return dir;
    } catch {
      // try the next candidate
    }
  }
  throw new Error("No writable data directory. Mount a volume at /data or set STELLAR_DATA_DIR.");
}

export function dataPath(file: string): string {
  // Plain concatenation: the directory is a runtime volume, not part of the build to trace.
  return `${dataDir()}${path.sep}${file}`;
}

/** Test hook: forget the resolved directory after changing STELLAR_DATA_DIR. */
export function resetDataDirCache(): void {
  cached = null;
}
