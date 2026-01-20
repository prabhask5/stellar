/**
 * Stellar Focus Extension - Build Script
 * Copies HTML and CSS files to dist folder after TypeScript compilation
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Directories
const srcDir = join(__dirname, 'src');
const distDir = join(__dirname, 'dist');

// Ensure dist directories exist
const dirs = [
  distDir,
  join(distDir, 'popup'),
  join(distDir, 'pages'),
  join(distDir, 'background'),
  join(distDir, 'auth'),
  join(distDir, 'lib')
];

for (const dir of dirs) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// Files to copy (source -> dest relative to src/dist)
const filesToCopy = [
  // Popup
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],

  // Blocked page
  ['pages/blocked.html', 'pages/blocked.html'],
  ['pages/blocked.css', 'pages/blocked.css'],
];

// Copy files
for (const [src, dest] of filesToCopy) {
  const srcPath = join(srcDir, src);
  const destPath = join(distDir, dest);

  if (existsSync(srcPath)) {
    copyFileSync(srcPath, destPath);
    console.log(`Copied: ${src} -> dist/${dest}`);
  } else {
    console.warn(`Warning: Source file not found: ${src}`);
  }
}

console.log('\nBuild complete!');
console.log('TypeScript files compiled to dist/');
console.log('HTML and CSS files copied to dist/');
