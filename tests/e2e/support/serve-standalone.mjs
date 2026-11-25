// Serves the production standalone build the same way the Docker image does.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/web");
const standalone = resolve(web, ".next/standalone/apps/web");
if (!existsSync(resolve(standalone, "server.js"))) {
  console.error("No standalone build found. Run `pnpm build` first.");
  process.exit(1);
}
cpSync(resolve(web, ".next/static"), resolve(standalone, ".next/static"), { recursive: true });
cpSync(resolve(web, "public"), resolve(standalone, "public"), { recursive: true });

const port = process.argv[2] ?? "3100";
const child = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  stdio: "inherit",
  env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1" },
});
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
