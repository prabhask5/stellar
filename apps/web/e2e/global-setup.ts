import { mkdirSync } from "node:fs";

export default function globalSetup() {
  mkdirSync(new URL("./.tmp", import.meta.url), { recursive: true });
}
