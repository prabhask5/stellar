import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateCss, generateSwift, generateTheme, type Tokens } from "../src/generate.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(resolve(root, "tokens.json"), "utf8")) as Tokens;

const targets: [string, string][] = [
  [resolve(root, "css/tokens.css"), generateCss(tokens)],
  [resolve(root, "css/theme.css"), generateTheme(tokens)],
  [resolve(root, "../../docs/ios/StellarTokens.swift"), generateSwift(tokens)],
];

for (const [file, content] of targets) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.info(`wrote ${file}`);
}
