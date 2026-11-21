// Generates every PWA image from one SVG (assets/icon.svg): app icons, the
// maskable icon, the Apple touch icon, the notification badge, and an
// apple-touch-startup-image for each current iPhone size.
// Usage: node scripts/generate-pwa-assets.mjs   (outputs are committed)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const icon = readFileSync(resolve(web, "assets/icon.svg"));
const out = (p) => resolve(web, "public", p);
mkdirSync(out("icons"), { recursive: true });
mkdirSync(out("splash"), { recursive: true });

const VOID = "#070615";

async function png(svg, size, file) {
  await sharp(svg, { density: 300 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out(file));
}

await png(icon, 192, "icons/icon-192.png");
await png(icon, 512, "icons/icon-512.png");
await png(icon, 180, "icons/apple-touch-icon.png");
await png(icon, 32, "icons/favicon-32.png");

// Maskable: the artwork sits inside the central 80% safe zone on a full-bleed background.
for (const size of [192, 512]) {
  const inner = Math.round(size * 0.74);
  const art = await sharp(icon, { density: 300 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: VOID } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toFile(out(`icons/maskable-${size}.png`));
}

// Monochrome badge for Android notifications.
const badge = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><path d="M48 10c4.5 25 13 33.5 38 38-25 4.5-33.5 13-38 38-4.5-25-13-33.5-38-38 25-4.5 33.5-13 38-38Z" fill="#fff"/></svg>',
);
await sharp(badge, { density: 300 }).resize(96, 96).png().toFile(out("icons/badge-96.png"));

// iPhone portrait screens: CSS width × height × device pixel ratio.
export const SPLASH = [
  [440, 956, 3], // 16/17 Pro Max
  [430, 932, 3], // 14 Pro Max, 15/16 Plus, 15 Pro Max
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [420, 912, 3], // iPhone Air
  [414, 896, 3], // XS Max, 11 Pro Max
  [414, 896, 2], // XR, 11
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [390, 844, 3], // 12, 13, 14
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // SE (2nd, 3rd), 8
  [320, 568, 2], // SE (1st)
];

function splashSvg(w, h) {
  const mark = Math.round(Math.min(w, h) * 0.26);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="a" cx="78%" cy="10%" r="55%"><stop offset="0" stop-color="#6e4cff" stop-opacity="0.42"/><stop offset="1" stop-color="#6e4cff" stop-opacity="0"/></radialGradient>
    <radialGradient id="b" cx="10%" cy="92%" r="50%"><stop offset="0" stop-color="#d648a0" stop-opacity="0.3"/><stop offset="1" stop-color="#d648a0" stop-opacity="0"/></radialGradient>
    <radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9c0" stop-opacity="0.9"/><stop offset="0.3" stop-color="#f6c76e" stop-opacity="0.35"/><stop offset="1" stop-color="#f6c76e" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${VOID}"/>
  <rect width="100%" height="100%" fill="url(#a)"/>
  <rect width="100%" height="100%" fill="url(#b)"/>
  <circle cx="${w / 2}" cy="${h / 2}" r="${mark * 1.5}" fill="url(#g)"/>
  <g transform="translate(${w / 2 - mark / 2} ${h / 2 - mark / 2}) scale(${mark / 212})">
    <path d="M106 0c9 70 36 97 106 106-70 9-97 36-106 106-9-70-36-97-106-106 70-9 97-36 106-106Z" fill="#f6c76e"/>
  </g>
</svg>`);
}

const meta = [];
for (const [w, h, dpr] of SPLASH) {
  const file = `splash/iphone-${w}x${h}@${dpr}x.png`;
  await sharp(splashSvg(w * dpr, h * dpr))
    .png({ compressionLevel: 9, palette: true, colors: 128 })
    .toFile(out(file));
  meta.push({
    url: `/${file}`,
    media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
  });
}
writeFileSync(resolve(web, "lib/splash.generated.json"), `${JSON.stringify(meta, null, 2)}\n`);
console.info(`generated ${6 + 1} icons and ${meta.length} splash screens`);
