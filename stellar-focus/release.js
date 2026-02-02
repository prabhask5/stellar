#!/usr/bin/env node

/**
 * Release script for Stellar Focus extension.
 *
 * Bumps the version in package.json, both manifests, and README.md,
 * then builds and packages zip files for upload to Firefox Add-ons
 * and Chrome Web Store.
 *
 * Usage:
 *   npm run release              # bump patch (1.0.6 -> 1.0.7)
 *   npm run release -- minor     # bump minor (1.0.6 -> 1.1.0)
 *   npm run release -- major     # bump major (1.0.6 -> 2.0.0)
 *   npm run release -- 1.2.3     # set explicit version
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FILES = {
  package: resolve(__dirname, 'package.json'),
  firefox: resolve(__dirname, 'manifests/firefox.json'),
  chrome: resolve(__dirname, 'manifests/chrome.json'),
  readme: resolve(__dirname, 'README.md'),
};

function readJSON(path) {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function writeJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
}

function bumpVersion(current, type) {
  const [major, minor, patch] = current.split('.').map(Number);
  switch (type) {
    case 'major': return `${major + 1}.0.0`;
    case 'minor': return `${major}.${minor + 1}.0`;
    case 'patch': return `${major}.${minor}.${patch + 1}`;
    default: return type; // explicit version string
  }
}

function isValidVersion(v) {
  return /^\d+\.\d+\.\d+$/.test(v);
}

// Determine bump type from CLI arg
const arg = process.argv[2] || 'patch';

// Read current version from firefox manifest (source of truth)
const firefox = readJSON(FILES.firefox);
const currentVersion = firefox.version;

const newVersion = bumpVersion(currentVersion, arg);

if (!isValidVersion(newVersion)) {
  console.error(`Invalid version: "${newVersion}". Use patch, minor, major, or an explicit x.y.z version.`);
  process.exit(1);
}

if (newVersion === currentVersion) {
  console.error(`Version is already ${currentVersion}. Nothing to do.`);
  process.exit(1);
}

console.log(`\nStellar Focus Release`);
console.log(`  ${currentVersion} -> ${newVersion}\n`);

// 1. Update manifests
const chrome = readJSON(FILES.chrome);
firefox.version = newVersion;
chrome.version = newVersion;
writeJSON(FILES.firefox, firefox);
writeJSON(FILES.chrome, chrome);
console.log(`  Updated manifests/firefox.json`);
console.log(`  Updated manifests/chrome.json`);

// 2. Update package.json
const pkg = readJSON(FILES.package);
pkg.version = newVersion;
writeJSON(FILES.package, pkg);
console.log(`  Updated package.json`);

// 3. Update README.md version badge
const readme = readFileSync(FILES.readme, 'utf-8');
const updatedReadme = readme.replace(
  /\*\*Version \d+\.\d+\.\d+\*\*/,
  `**Version ${newVersion}**`
);
writeFileSync(FILES.readme, updatedReadme);
console.log(`  Updated README.md`);

// 4. Type check
console.log(`\n  Running typecheck...`);
try {
  execSync('npm run typecheck', { cwd: __dirname, stdio: 'inherit' });
} catch {
  console.error('\n  Typecheck failed. Version files have been updated — fix errors and re-run package.');
  process.exit(1);
}

// 5. Build & package
console.log(`\n  Building & packaging...`);
try {
  execSync('npm run package', { cwd: __dirname, stdio: 'inherit' });
} catch {
  console.error('\n  Build/package failed.');
  process.exit(1);
}

console.log(`\n  Release ${newVersion} ready!`);
console.log(`    stellar-focus-firefox.zip`);
console.log(`    stellar-focus-chrome.zip\n`);
