/**
 * Stellar Focus Extension - Build Script
 * Uses esbuild to bundle TypeScript for Firefox and Chrome
 *
 * Usage:
 *   node build.js           - Build for all targets
 *   node build.js firefox   - Build for Firefox only
 *   node build.js chrome    - Build for Chrome only
 */

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse command line arguments
const args = process.argv.slice(2);
const targetArg = args[0]?.toLowerCase();

// Determine which targets to build
const targets = [];
if (!targetArg || targetArg === 'all') {
  targets.push('firefox', 'chrome');
} else if (targetArg === 'firefox' || targetArg === 'chrome') {
  targets.push(targetArg);
} else {
  console.error(`Unknown target: ${targetArg}`);
  console.error('Usage: node build.js [firefox|chrome|all]');
  process.exit(1);
}

// Directories
const srcDir = join(__dirname, 'src');
const manifestsDir = join(__dirname, 'manifests');
const iconsDir = join(__dirname, 'icons');

// Build configuration per target
const targetConfig = {
  firefox: {
    distDir: join(__dirname, 'dist-firefox'),
    esbuildTarget: 'firefox109',
    manifestFile: 'firefox.json',
  },
  chrome: {
    distDir: join(__dirname, 'dist-chrome'),
    esbuildTarget: 'chrome109',
    manifestFile: 'chrome.json',
  },
};

// Files to copy from src to dist
const filesToCopy = [
  ['popup/popup.html', 'popup/popup.html'],
  ['popup/popup.css', 'popup/popup.css'],
  ['pages/blocked.html', 'pages/blocked.html'],
  ['pages/blocked.css', 'pages/blocked.css'],
  ['options/options.html', 'options/options.html'],
  ['options/options.css', 'options/options.css'],
  ['privacy/privacy.html', 'privacy/privacy.html'],
  ['privacy/privacy.css', 'privacy/privacy.css'],
  ['privacy/privacy.js', 'privacy/privacy.js'],
];

async function buildTarget(target) {
  const config = targetConfig[target];
  const { distDir, esbuildTarget, manifestFile } = config;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Building for ${target.toUpperCase()}...`);
  console.log(`${'='.repeat(50)}`);

  // Ensure dist directories exist
  const dirs = [
    distDir,
    join(distDir, 'popup'),
    join(distDir, 'pages'),
    join(distDir, 'background'),
    join(distDir, 'options'),
    join(distDir, 'privacy'),
    join(distDir, 'icons'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // Common esbuild options
  const commonOptions = {
    bundle: true,
    format: 'esm',
    target: esbuildTarget,
    sourcemap: true,
    minify: false, // Keep readable for debugging
  };

  // Build popup script
  console.log('  Building popup.js...');
  await build({
    ...commonOptions,
    entryPoints: [join(srcDir, 'popup/popup.ts')],
    outfile: join(distDir, 'popup/popup.js'),
  });

  // Build service worker
  console.log('  Building service-worker.js...');
  await build({
    ...commonOptions,
    entryPoints: [join(srcDir, 'background/service-worker.ts')],
    outfile: join(distDir, 'background/service-worker.js'),
  });

  // Build blocked page script
  console.log('  Building blocked.js...');
  await build({
    ...commonOptions,
    entryPoints: [join(srcDir, 'pages/blocked.ts')],
    outfile: join(distDir, 'pages/blocked.js'),
  });

  // Build options page script
  console.log('  Building options.js...');
  await build({
    ...commonOptions,
    entryPoints: [join(srcDir, 'options/options.ts')],
    outfile: join(distDir, 'options/options.js'),
  });

  // Copy static files from src
  console.log('  Copying static files...');
  for (const [src, dest] of filesToCopy) {
    const srcPath = join(srcDir, src);
    const destPath = join(distDir, dest);

    if (existsSync(srcPath)) {
      copyFileSync(srcPath, destPath);
      console.log(`    Copied: ${src}`);
    } else {
      console.warn(`    Warning: Source file not found: ${src}`);
    }
  }

  // Copy manifest
  const manifestSrc = join(manifestsDir, manifestFile);
  const manifestDest = join(distDir, 'manifest.json');
  if (existsSync(manifestSrc)) {
    copyFileSync(manifestSrc, manifestDest);
    console.log(`    Copied: manifest.json (from ${manifestFile})`);
  } else {
    console.error(`    Error: Manifest not found: ${manifestSrc}`);
    process.exit(1);
  }

  // Copy icons
  if (existsSync(iconsDir)) {
    const iconFiles = ['icon-48.png', 'icon-128.png'];
    for (const icon of iconFiles) {
      const iconSrc = join(iconsDir, icon);
      const iconDest = join(distDir, 'icons', icon);
      if (existsSync(iconSrc)) {
        copyFileSync(iconSrc, iconDest);
        console.log(`    Copied: icons/${icon}`);
      }
    }
  }

  console.log(`  ✓ ${target.charAt(0).toUpperCase() + target.slice(1)} build complete!`);
}

// Build all requested targets
async function main() {
  console.log('Stellar Focus Extension Builder');
  console.log(`Targets: ${targets.join(', ')}`);

  for (const target of targets) {
    await buildTarget(target);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('All builds complete!');
  console.log(`${'='.repeat(50)}`);

  // Print output locations
  for (const target of targets) {
    console.log(`  ${target}: ${targetConfig[target].distDir}`);
  }
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
