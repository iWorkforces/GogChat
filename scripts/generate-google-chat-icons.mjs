/**
 * Generate Google Chat-style icons for GogChat.
 *
 * Creates all required icon variants:
 *
 * Tray icons (menu bar — white glyphs with transparent cutouts for dark mode):
 *   resources/icons/tray/iconTemplate.png          (22×22, 1x) — default/idle
 *   resources/icons/tray/iconTemplate@2x.png       (44×44, 2x Retina) — default/idle
 *   resources/icons/tray/iconUnreadTemplate.png    (22×22, 1x) — unread messages
 *   resources/icons/tray/iconUnreadTemplate@2x.png (44×44, 2x Retina) — unread messages
 *
 * App icons — normal state (full-color speech bubble):
 *   resources/icons/normal/16.png
 *   resources/icons/normal/32.png
 *   resources/icons/normal/48.png
 *   resources/icons/normal/64.png
 *   resources/icons/normal/256.png
 *   resources/icons/normal/mac.icns  (macOS app icon, 1024×1024 source)
 *   resources/icons/normal/win.ico   (Windows app icon, generated from normal PNGs)
 *
 * App icons — badge state (speech bubble + red notification dot):
 *   resources/icons/badge/16.png
 *   resources/icons/badge/32.png
 *   resources/icons/badge/48.png
 *   resources/icons/badge/64.png
 *   resources/icons/badge/256.png
 *
 * App icons — offline state (greyed-out speech bubble):
 *   resources/icons/offline/16.png
 *   resources/icons/offline/32.png
 *   resources/icons/offline/48.png
 *   resources/icons/offline/64.png
 *   resources/icons/offline/256.png
 *
 * Also updates:
 *   resources/icons/normal/scalable.svg  (vector source for Linux/reference)
 *
 * Usage:
 *   bun scripts/generate-google-chat-icons.mjs
 *   node scripts/generate-google-chat-icons.mjs
 */

import sharp from 'sharp';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createIcoBuffer } from './ico-writer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ICONS_DIR = join(ROOT_DIR, 'resources', 'icons');

// Google brand colors (official)
const COLORS = {
  blue: '#4285F4',
  green: '#34A853',
  yellow: '#FBBC05',
  red: '#EA4335',
  white: '#FFFFFF',
  offlineGray: '#9AA0A6',
  black: '#000000',
};

const APP_GEOMETRY = {
  left: 18,
  top: 17,
  right: 82,
  bottom: 70,
  cornerRadius: 12,
  cut: 10,
  tailBaseStart: 33,
  tailNeckX: 20,
  tailTipX: 16,
  tailTipY: 82,
  innerLeft: 30,
  innerTop: 29,
  innerRight: 70,
  innerBottom: 54,
  innerRadius: 7,
  innerCut: 6,
  blueSplit: 50,
  topBandHeight: 10,
  redBase: 12,
};

const TRAY_GEOMETRY = {
  left: 4.5,
  top: 4.5,
  right: 95.5,
  bottom: 80.5,
  cornerRadius: 17,
  cut: 14.5,
  tailBaseStart: 25,
  tailNeckX: 10,
  tailTipX: 4.5,
  tailTipY: 96,
  innerLeft: 21.5,
  innerTop: 19.5,
  innerRight: 79,
  innerBottom: 62.5,
  innerRadius: 9.5,
  innerCut: 8,
};

const TRAY_ARTWORK_SCALE = 0.9;

// Ensure icon subdirectories exist
for (const dir of ['tray', 'normal', 'badge', 'offline', 'aura']) {
  const p = join(ICONS_DIR, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

// ---------------------------------------------------------------------------
// SVG path helpers (0–100 coordinate space, scaled to canvas size)
// ---------------------------------------------------------------------------

/**
 * Build the outer speech bubble path in a 0–100 coordinate space.
 * Shape:
 *   - Rounded TL / BR / BL corners
 *   - Clipped top-right corner
 *   - Bottom-left tail notch
 */
function buildOuterBubble(p, r, g = APP_GEOMETRY) {
  const left = g.left;
  const top = g.top;
  const right = g.right;
  const bottom = g.bottom;
  const radius = r;
  const cut = g.cut;

  return [
    `M ${p(left + radius)},${p(top)}`,
    `L ${p(right - cut)},${p(top)}`,
    `L ${p(right)},${p(top + cut)}`,
    `L ${p(right)},${p(bottom - radius)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(right - radius)},${p(bottom)}`,
    `L ${p(g.tailBaseStart)},${p(bottom)}`,
    `L ${p(g.tailTipX)},${p(g.tailTipY)}`,
    `L ${p(g.tailNeckX)},${p(bottom)}`,
    `L ${p(left + radius)},${p(bottom)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(left)},${p(bottom - radius)}`,
    `L ${p(left)},${p(top + radius)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(left + radius)},${p(top)}`,
    `Z`,
  ].join(' ');
}

/**
 * Build the inner cutout path in a 0–100 coordinate space.
 * Slightly chamfered top-right to match outer bubble proportions.
 */
function buildInnerCutout(p, r, g = APP_GEOMETRY) {
  const left = g.innerLeft;
  const top = g.innerTop;
  const right = g.innerRight;
  const bottom = g.innerBottom;
  const radius = r;
  const cut = g.innerCut;

  return [
    `M ${p(left + radius)},${p(top)}`,
    `L ${p(right - cut)},${p(top)}`,
    `L ${p(right)},${p(top + cut)}`,
    `L ${p(right)},${p(bottom - radius)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(right - radius)},${p(bottom)}`,
    `L ${p(left + radius)},${p(bottom)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(left)},${p(bottom - radius)}`,
    `L ${p(left)},${p(top + radius)}`,
    `A ${p(radius)},${p(radius)} 0 0 1 ${p(left + radius)},${p(top)}`,
    `Z`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Icon SVG generators
// ---------------------------------------------------------------------------

/**
 * Google Chat speech bubble — full color (2023 four-color brand style).
 *
 * @param {number} s - Canvas size in pixels
 * @param {object} opts
 * @param {boolean} [opts.hasBadge=false]       - Show red notification dot
 * @param {boolean} [opts.isOffline=false]       - Use greyed-out color scheme
 * @param {boolean} [opts.withBackground=false]  - Include macOS rounded-square background
 */
function chatIconSvg(s, opts = {}) {
  const { hasBadge = false, isOffline = false, withBackground = false } = opts;

  const isSmall = s < 64;
  const useShadow = s >= 128;

  const scale = (v) => ((v * s) / 100).toFixed(3);
  const idBase = `gc-${s}-${hasBadge ? 'badge' : 'normal'}-${isOffline ? 'offline' : 'online'}`;
  const clipId = `${idBase}-clip`;
  const shadowId = `${idBase}-shadow`;
  const bgGradientId = `${idBase}-bg-gradient`;

  const outerPath = buildOuterBubble(scale, APP_GEOMETRY.cornerRadius, APP_GEOMETRY);
  const innerPath = buildInnerCutout(scale, APP_GEOMETRY.innerRadius, APP_GEOMETRY);

  const defs = [];

  if (withBackground && !isOffline && !isSmall) {
    defs.push(`<linearGradient id="${bgGradientId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F8F9FA"/>
    </linearGradient>`);
  }

  if (useShadow) {
    const shadowDy = ((2 * s) / 256).toFixed(3);
    const shadowBlur = ((3 * s) / 256).toFixed(3);
    defs.push(`<filter id="${shadowId}" x="-20%" y="-20%" width="140%" height="150%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000000" flood-opacity="0.18"/>
    </filter>`);
  }

  // macOS squircle background (Apple HIG: ~22.37% of canvas)
  const bgRadius = Math.round(s * 0.2237);
  const bgFill = isOffline
    ? '#F1F3F4'
    : !isSmall && withBackground
      ? `url(#${bgGradientId})`
      : '#FFFFFF';
  const bgRect = withBackground
    ? `<rect width="${s}" height="${s}" rx="${bgRadius}" ry="${bgRadius}" fill="${bgFill}"/>`
    : '';

  const defsBlock =
    defs.length > 0
      ? `<defs>
    ${defs.join('\n    ')}
  </defs>`
      : '';

  let content;
  if (s >= 64 && !isOffline) {
    content = buildMultiColorContent(scale, outerPath, innerPath, hasBadge, {
      clipId,
      shadowId,
      useShadow,
      geometry: APP_GEOMETRY,
      size: s,
      isSmall,
    });
  } else {
    const fillColor = isOffline ? COLORS.offlineGray : COLORS.green;
    const cutoutColor = isOffline ? '#E8EAED' : COLORS.white;
    content = buildSingleColorContent(
      outerPath,
      innerPath,
      fillColor,
      cutoutColor,
      scale,
      hasBadge,
      {
        shadowId,
        useShadow,
        size: s,
        isSmall,
      }
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${defsBlock}
  ${bgRect}
  ${content}
</svg>`;
}

/**
 * Multi-color content: Google four-color treatment (blue, green, yellow, red).
 * Used for dock/app icons ≥ 64px in normal state.
 */
function buildMultiColorContent(scale, outerPath, innerPath, hasBadge, opts = {}) {
  const {
    clipId = `gc-clip-${Math.random().toString(36).slice(2, 7)}`,
    shadowId = '',
    useShadow = false,
    geometry = APP_GEOMETRY,
    size = 256,
    isSmall = false,
  } = opts;

  const badgeSvg = hasBadge ? buildBadgeDot(scale, { size, isSmall }) : '';
  const topBandBottom = geometry.top + geometry.topBandHeight;
  const redPoints = [
    `${scale(geometry.right - geometry.cut)},${scale(geometry.top)}`,
    `${scale(geometry.right)},${scale(geometry.top + geometry.cut)}`,
    `${scale(geometry.right - geometry.redBase)},${scale(geometry.top + geometry.cut)}`,
  ].join(' ');

  const openGroup = useShadow && shadowId ? `<g filter="url(#${shadowId})">` : '<g>';

  return `<defs>
    <clipPath id="${clipId}">
      <path d="${outerPath}"/>
    </clipPath>
  </defs>
  ${openGroup}
    <path d="${outerPath}" fill="${COLORS.green}"/>
    <rect x="0" y="0" width="${scale(geometry.blueSplit)}" height="${scale(100)}" fill="${COLORS.blue}" clip-path="url(#${clipId})"/>
    <rect x="0" y="0" width="${scale(100)}" height="${scale(topBandBottom)}" fill="${COLORS.yellow}" clip-path="url(#${clipId})"/>
    <polygon points="${redPoints}" fill="${COLORS.red}" clip-path="url(#${clipId})"/>
  </g>
  <path d="${innerPath}" fill="${COLORS.white}"/>
  ${badgeSvg}`;
}

/**
 * Single-color content: one fill color for the bubble.
 */
function buildSingleColorContent(
  outerPath,
  innerPath,
  fillColor,
  cutoutColor,
  scale,
  hasBadge,
  opts = {}
) {
  const { shadowId = '', useShadow = false, size = 256, isSmall = false } = opts;
  const badgeSvg = hasBadge ? buildBadgeDot(scale, { size, isSmall }) : '';
  const outer =
    useShadow && shadowId
      ? `<g filter="url(#${shadowId})"><path d="${outerPath}" fill="${fillColor}"/></g>`
      : `<path d="${outerPath}" fill="${fillColor}"/>`;

  return `${outer}
  <path d="${innerPath}" fill="${cutoutColor}"/>
  ${badgeSvg}`;
}

/**
 * Red notification badge dot at top-right of the bubble.
 * White border ring + red fill.
 */
function buildBadgeDot(scale, opts = {}) {
  const { size = 256, isSmall = false } = opts;

  const fmt = (n) => Number(n).toFixed(3);
  const cx = Number(scale(isSmall ? 83 : 82));
  const cy = Number(scale(isSmall ? 14.5 : 15));

  const outerRadius = isSmall ? Math.max(2.6, size * 0.18) : size * 0.108;
  const ringWidth = isSmall ? Math.max(0.9, size * 0.035) : (size / 256) * 2;
  const innerRadius = Math.max(outerRadius - ringWidth, outerRadius * 0.62);

  return `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(outerRadius)}" fill="${COLORS.white}"/>
  <circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(innerRadius)}" fill="${COLORS.red}"/>`;
}

function trayArtworkTransform(s) {
  const center = s / 2;
  return `translate(${center} ${center}) scale(${TRAY_ARTWORK_SCALE}) translate(${-center} ${-center})`;
}

/**
 * Monochrome tray icon SVG for the macOS menu bar.
 * White speech bubble glyph with a transparent inner cutout.
 *
 * @param {number} s - Canvas size in pixels (22 for 1×, 44 for 2×)
 */
function trayIconSvg(s) {
  const scale = (v) => ((v * s) / 100).toFixed(3);
  const outerPath = buildOuterBubble(scale, TRAY_GEOMETRY.cornerRadius, TRAY_GEOMETRY);
  const innerPath = buildInnerCutout(scale, TRAY_GEOMETRY.innerRadius, TRAY_GEOMETRY);
  const maskPath = `${outerPath} ${innerPath}`;
  const transform = trayArtworkTransform(s);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <!-- Visible pixels are white; transparent pixels remain cut out. -->
  <g transform="${transform}">
    <path d="${maskPath}" fill="${COLORS.white}" fill-rule="evenodd"/>
  </g>
</svg>`;
}
/**
 * Monochrome tray icon with unread dot for the macOS menu bar.
 * Same speech bubble as trayIconSvg() plus a small filled circle in the
 * upper-right corner to signal unread messages.
 * The dot is a solid white circle (no ring), matching the tray glyph.
 *
 * @param {number} s - Canvas size in pixels (22 for 1×, 44 for 2×)
 */
function trayUnreadIconSvg(s) {
  const scale = (v) => ((v * s) / 100).toFixed(3);
  const outerPath = buildOuterBubble(scale, TRAY_GEOMETRY.cornerRadius, TRAY_GEOMETRY);
  const innerPath = buildInnerCutout(scale, TRAY_GEOMETRY.innerRadius, TRAY_GEOMETRY);
  const maskPath = `${outerPath} ${innerPath}`;
  const transform = trayArtworkTransform(s);

  // Unread dot: solid filled circle at upper-right of the bubble.
  // Coordinates in the 0–100 space matching TRAY_GEOMETRY.
  // Placed at the clipped corner area (around x=88, y=12) so it's
  // clearly visible without overlapping the inner cutout.
  const dotCx = Number(scale(88));
  const dotCy = Number(scale(12));
  const dotR = Number(scale(s >= 36 ? 11 : 10)); // slightly larger on 2×
  const fmt = (n) => Number(n).toFixed(3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <!-- Visible pixels are white; transparent pixels remain cut out. -->
  <g transform="${transform}">
    <path d="${maskPath}" fill="${COLORS.white}" fill-rule="evenodd"/>
    <!-- Unread dot — solid white pixel data matching the tray glyph. -->
    <circle cx="${fmt(dotCx)}" cy="${fmt(dotCy)}" r="${fmt(dotR)}" fill="${COLORS.white}"/>
  </g>
</svg>`;
}

/**
 * Aura icon — speech bubble with a soft radiant glow for dialog displays.
 * Uses the full four-color brand treatment with a radial gradient aura
 * behind the bubble, creating a luminous/polished appearance.
 *
 * @param {number} s - Canvas size in pixels (recommended: 256)
 */
function auraIconSvg(s) {
  const scale = (v) => ((v * s) / 100).toFixed(3);
  const outerPath = buildOuterBubble(scale, APP_GEOMETRY.cornerRadius, APP_GEOMETRY);
  const innerPath = buildInnerCutout(scale, APP_GEOMETRY.innerRadius, APP_GEOMETRY);
  const clipId = `gc-aura-${s}-clip`;
  const glowId = `gc-aura-${s}-glow`;
  const shadowId = `gc-aura-${s}-shadow`;

  // Amplified drop shadow for depth against the glow
  const shadowDy = ((4 * s) / 256).toFixed(3);
  const shadowBlur = ((12 * s) / 256).toFixed(3);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <!-- Radial aura glow — visible against the about dialog white background -->
    <radialGradient id="${glowId}" cx="48%" cy="50%" r="55%">
      <stop offset="0%" stop-color="#4285F4" stop-opacity="0.25"/>
      <stop offset="30%" stop-color="#7C4DFF" stop-opacity="0.12"/>
      <stop offset="60%" stop-color="#4285F4" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#4285F4" stop-opacity="0"/>
    </radialGradient>
    <filter id="${shadowId}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="${shadowDy}" stdDeviation="${shadowBlur}" flood-color="#000000" flood-opacity="0.15"/>
    </filter>
    <clipPath id="${clipId}">
      <path d="${outerPath}"/>
    </clipPath>
  </defs>
  <!-- Aura glow canvas — no opaque background so glow bleeds into dialog white -->
  <rect x="0" y="0" width="${s}" height="${s}" fill="url(#${glowId})"/>
  ${buildMultiColorContent(scale, outerPath, innerPath, false, {
    clipId,
    shadowId,
    useShadow: true,
    geometry: APP_GEOMETRY,
    size: s,
    isSmall: false,
  })}
</svg>`;
}

/**
 * Scalable SVG for resources/icons/normal/scalable.svg.
 * Modern Google Chat 4-color speech bubble, viewBox 0 0 512 512.
 */
function scalableSvg() {
  const s = 512;
  const scale = (v) => ((v * s) / 100).toFixed(1);
  const outerPath = buildOuterBubble(scale, APP_GEOMETRY.cornerRadius, APP_GEOMETRY);
  const innerPath = buildInnerCutout(scale, APP_GEOMETRY.innerRadius, APP_GEOMETRY);
  const clipId = 'gc-scalable-clip';

  return `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img" aria-labelledby="gc-title gc-desc">
  <title id="gc-title">Google Chat</title>
  <desc id="gc-desc">Google Chat speech bubble icon with four-color brand treatment and clipped top-right corner.</desc>
  ${buildMultiColorContent(scale, outerPath, innerPath, false, {
    clipId,
    geometry: APP_GEOMETRY,
    size: s,
    isSmall: false,
    useShadow: false,
  })}
</svg>`;
}

// ---------------------------------------------------------------------------
// PNG conversion helper
// ---------------------------------------------------------------------------

async function svgToPng(svgString, size) {
  return sharp(Buffer.from(svgString)).resize(size, size).png().toBuffer();
}

// ---------------------------------------------------------------------------
// .icns generation (macOS only)
// ---------------------------------------------------------------------------

async function generateIcns(png1024Buffer, outputPath) {
  const tmpDir = join(ICONS_DIR, 'gogchat-tmp.iconset');
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  // iconutil required sizes
  const iconsetSizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
  ];

  for (const [size, filename] of iconsetSizes) {
    const resized = await sharp(png1024Buffer).resize(size, size).png().toBuffer();
    writeFileSync(join(tmpDir, filename), resized);
  }

  try {
    execSync(`iconutil -c icns "${tmpDir}" -o "${outputPath}"`, { stdio: 'pipe' });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function generateIcoFromNormalPngs(outputPath) {
  const images = APP_SIZES.map((size) => ({
    size,
    buffer: readFileSync(join(ICONS_DIR, 'normal', `${size}.png`)),
  }));
  writeFileSync(outputPath, createIcoBuffer(images));
}

// ---------------------------------------------------------------------------
// Icon specification table
// ---------------------------------------------------------------------------

const APP_SIZES = [16, 32, 48, 64, 256];

const ICON_SPECS = [
  // Tray icons — macOS menu bar (white glyphs for dark mode)
  { path: 'tray/iconTemplate.png', generator: () => trayIconSvg(22), size: 22 },
  { path: 'tray/iconTemplate@2x.png', generator: () => trayIconSvg(44), size: 44 },

  // Tray icon — unread state (white glyph with filled dot at upper-right)
  { path: 'tray/iconUnreadTemplate.png', generator: () => trayUnreadIconSvg(22), size: 22 },
  { path: 'tray/iconUnreadTemplate@2x.png', generator: () => trayUnreadIconSvg(44), size: 44 },

  // Normal state — full-color Google Chat bubble
  ...APP_SIZES.map((size) => ({
    path: `normal/${size}.png`,
    generator: () => chatIconSvg(size, { withBackground: size >= 64 }),
    size,
  })),

  // Badge state — speech bubble + red notification dot
  ...APP_SIZES.map((size) => ({
    path: `badge/${size}.png`,
    generator: () => chatIconSvg(size, { hasBadge: true, withBackground: size >= 64 }),
    size,
  })),

  // Offline state — greyed-out speech bubble
  ...APP_SIZES.map((size) => ({
    path: `offline/${size}.png`,
    generator: () => chatIconSvg(size, { isOffline: true, withBackground: size >= 64 }),
    size,
  })),
  // Aura state — speech bubble with soft radiant glow for About dialog
  ...APP_SIZES.map((size) => ({
    path: `aura/${size}.png`,
    generator: () => auraIconSvg(size),
    size,
  })),
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('GogChat icon generator — Google Chat style (2023+)\n');
console.log('Generating PNG icons...\n');

let ok = 0;
let fail = 0;

for (const spec of ICON_SPECS) {
  try {
    const svg = spec.generator();
    const png = await svgToPng(svg, spec.size);
    const outPath = join(ICONS_DIR, spec.path);
    writeFileSync(outPath, png);
    console.log(`  ✓  ${spec.path.padEnd(38)} (${spec.size}×${spec.size})`);
    ok++;
  } catch (err) {
    console.error(`  ✗  ${spec.path}: ${err.message}`);
    fail++;
  }
}

// Scalable SVG
console.log('\nGenerating scalable.svg...\n');
try {
  writeFileSync(join(ICONS_DIR, 'normal', 'scalable.svg'), scalableSvg(), 'utf-8');
  console.log('  ✓  normal/scalable.svg');
  ok++;
} catch (err) {
  console.error(`  ✗  normal/scalable.svg: ${err.message}`);
  fail++;
}

// .icns app icon
console.log('\nGenerating normal/mac.icns (1024×1024 source)...\n');
try {
  const appSvg = chatIconSvg(1024, { withBackground: true });
  const png1024 = await svgToPng(appSvg, 1024);
  await generateIcns(png1024, join(ICONS_DIR, 'normal', 'mac.icns'));
  console.log('  ✓  normal/mac.icns');
  ok++;
} catch (err) {
  console.error(`  ✗  normal/mac.icns: ${err.message}`);
  if (err.message.includes('iconutil')) {
    console.error('     (iconutil is macOS-only — skipped on non-macOS)');
  }
  fail++;
}

// .ico app icon
console.log('\nGenerating normal/win.ico (normal PNG set)...\n');
try {
  generateIcoFromNormalPngs(join(ICONS_DIR, 'normal', 'win.ico'));
  console.log('  ✓  normal/win.ico');
  ok++;
} catch (err) {
  console.error(`  ✗  normal/win.ico: ${err.message}`);
  fail++;
}

console.log(`\n${'─'.repeat(52)}\nDone. ${ok} generated, ${fail} failed.\n`);

if (fail > 0) process.exitCode = 1;
