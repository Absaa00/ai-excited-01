// ai-excited-01 entry — "Look up." (Node 22, standard library only).
//
// A colossal luminous jellyfish has drifted down out of the night sky and
// hangs above a tiny sleeping city, its tentacles of light trailing toward
// the rooftops while one small hot-air balloon rises to meet it. The idea is
// scale turned upside down: a sea creature in the sky, bigger than the city
// below it, glowing cyan-violet-magenta against deep indigo night.
//
// The image is drawn procedurally, pixel by pixel, from a fixed seed — no
// assets, no network, no randomness from the environment — so both grader
// runs write byte-identical PNGs. The program encodes the PNG itself
// (zlib deflate + CRC32, standard library only) and writes it to
// /output/entry.png (or $MAKEFUN_OUTPUT_DIR when set, for local runs):
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Deterministic randomness: mulberry32 with a fixed seed. Every random call
// below happens in a fixed order, so the picture is identical every run.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// ---------------------------------------------------------------------------
// Canvas: one RGB buffer, alpha-blended drawing helpers.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];
const buf = new Uint8Array(W * H * 3);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix3(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Blend one pixel toward (r, g, b) by alpha (0..1). Channels are clamped
// first: a value above 255 would otherwise wrap modulo 256 in the Uint8
// buffer and flip a bright highlight into a wrong colour.
function px(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  if (a > 1) a = 1;
  r = clamp(r, 0, 255);
  g = clamp(g, 0, 255);
  b = clamp(b, 0, 255);
  const i = (y * W + x) * 3;
  buf[i] = buf[i] + (r - buf[i]) * a;
  buf[i + 1] = buf[i + 1] + (g - buf[i + 1]) * a;
  buf[i + 2] = buf[i + 2] + (b - buf[i + 2]) * a;
}

// Solid disc, optionally feathered at the rim (soft = feather width in px).
function disc(cx: number, cy: number, r: number, c: RGB, a: number, soft = 0): void {
  const x0 = Math.max(0, Math.floor(cx - r - soft));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + soft));
  const y0 = Math.max(0, Math.floor(cy - r - soft));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + soft));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
      if (d > r + soft) continue;
      let alpha = a;
      if (soft > 0 && d > r) alpha = a * (1 - (d - r) / soft);
      px(x, y, c[0], c[1], c[2], alpha);
    }
  }
}

// Soft radial glow: alpha falls off as (1 - d/r)^power from the centre.
function glow(cx: number, cy: number, r: number, c: RGB, peak: number, power = 2): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
      if (d >= 1) continue;
      px(x, y, c[0], c[1], c[2], peak * Math.pow(1 - d, power));
    }
  }
}

// Thick line (round caps) drawn as a chain of discs.
function thickLine(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(len / Math.max(1, w / 3)));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    disc(x0 + dx * t, y0 + dy * t, w / 2, c, a, 1);
  }
}

// Filled rectangle with alpha.
function rect(x0: number, y0: number, w: number, h: number, c: RGB, a: number): void {
  const xa = Math.max(0, Math.floor(x0));
  const xb = Math.min(W - 1, Math.ceil(x0 + w));
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(H - 1, Math.ceil(y0 + h));
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) px(x, y, c[0], c[1], c[2], a);
  }
}

// ---------------------------------------------------------------------------
// Sky: vertical gradient, milky-way band, stars, a soft moon.
// ---------------------------------------------------------------------------
const SKY_TOP: RGB = [13, 17, 52];
const SKY_MID: RGB = [16, 19, 58];
const SKY_HORIZON: RGB = [52, 32, 84];

function drawSky(): void {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const c = t < 0.55 ? mix3(SKY_TOP, SKY_MID, t / 0.55) : mix3(SKY_MID, SKY_HORIZON, (t - 0.55) / 0.45);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
    }
  }
  // Milky-way band: a diagonal drift of faint dots, upper left to right.
  for (let i = 0; i < 900; i++) {
    const t = rand();
    const bx = t * W;
    const by = 210 - t * 150 + (rand() - 0.5) * 190;
    const a = 0.04 + rand() * 0.13;
    const warm: RGB = rand() < 0.5 ? [200, 210, 255] : [255, 220, 240];
    px(Math.round(bx), Math.round(by), warm[0], warm[1], warm[2], a);
  }
  // Stars: mostly 1 px, a dozen bright ones with a cross sparkle.
  for (let i = 0; i < 340; i++) {
    const x = rand() * W;
    const y = rand() * 800;
    const b = 0.35 + rand() * 0.65;
    const c: RGB = rand() < 0.7 ? [235, 240, 255] : [255, 235, 200];
    if (rand() < 0.05) {
      disc(x, y, 2.2, c, b * 0.9, 1.5);
      thickLine(x - 6, y, x + 6, y, 1, c, b * 0.5);
      thickLine(x, y - 6, x, y + 6, 1, c, b * 0.5);
    } else {
      px(Math.round(x), Math.round(y), c[0], c[1], c[2], b);
      if (rand() < 0.3) px(Math.round(x) + 1, Math.round(y), c[0], c[1], c[2], b * 0.5);
    }
  }
  // Moon, upper left: pale disc, warm glow, a few soft craters.
  glow(148, 138, 95, [240, 230, 200], 0.22, 2.4);
  disc(148, 138, 44, [242, 236, 214], 0.98, 2);
  disc(132, 126, 8, [214, 206, 182], 0.5, 2);
  disc(160, 150, 6, [214, 206, 182], 0.45, 2);
  disc(150, 118, 4, [214, 206, 182], 0.4, 2);
}

// ---------------------------------------------------------------------------
// City: a dark sleeping skyline along the bottom, warm lit windows.
// ---------------------------------------------------------------------------
function drawCity(): void {
  const base = 1024;
  let x = -10;
  while (x < W + 10) {
    const w = 30 + rand() * 44;
    const h = 70 + rand() * 130;
    const top = base - h;
    const shade = 4 + rand() * 6;
    const bc: RGB = [shade, shade + 2, shade + 10];
    rect(x, top, w, h, bc, 1);
    // Rooftop details: antenna on some, water tower on others.
    const roll = rand();
    if (roll < 0.22) {
      thickLine(x + w / 2, top, x + w / 2, top - 26, 2, bc, 1);
      disc(x + w / 2, top - 28, 3, [255, 70, 70], 0.9, 1);
      glow(x + w / 2, top - 28, 10, [255, 70, 70], 0.35, 2);
    } else if (roll < 0.4) {
      rect(x + w * 0.25, top - 16, w * 0.5, 16, bc, 1);
      thickLine(x + w * 0.2, top - 16, x + w * 0.8, top - 16, 2, bc, 1);
    }
    // Windows: 9x13 grid, some lit warm, a few cool.
    for (let wy = top + 12; wy < base - 10; wy += 15) {
      for (let wx = x + 6; wx < x + w - 8; wx += 11) {
        if (rand() < 0.42) {
          const wc: RGB = rand() < 0.82 ? [255, 210, 125] : [160, 210, 255];
          rect(wx, wy, 4, 6, wc, 0.55 + rand() * 0.4);
        }
      }
    }
    x += w + 2 + rand() * 8;
  }
  // One tall tower with a red beacon, right of centre.
  rect(842, 1024 - 215, 34, 215, [7, 8, 18], 1);
  thickLine(859, 1024 - 215, 859, 1024 - 248, 2, [7, 8, 18], 1);
  disc(859, 1024 - 250, 3.5, [255, 70, 70], 0.95, 1);
  glow(859, 1024 - 250, 12, [255, 70, 70], 0.4, 2);
  for (let wy = 1024 - 200; wy < 1014; wy += 15) {
    for (let wx = 848; wx < 872; wx += 11) {
      if (rand() < 0.5) rect(wx, wy, 4, 6, [255, 210, 125], 0.8);
    }
  }
}

// ---------------------------------------------------------------------------
// The jellyfish: a huge glowing bell over the city, ribbed dome, trailing
// tentacles of light, and a halo that washes the sky around it.
// ---------------------------------------------------------------------------
const JELLY_CX = 512;
const JELLY_CY = 330;
const JELLY_RX = 305;
const JELLY_RY = 245;
const DOME_CORE: RGB = [235, 255, 255];
const DOME_MID: RGB = [110, 243, 255];
const DOME_RIM: RGB = [178, 140, 255];
const DOME_EDGE: RGB = [255, 110, 199];

// Wavy lower rim of the bell.
function rimY(x: number): number {
  return JELLY_CY + 62 + 13 * Math.sin(x * 0.02 + 1.3) + 6 * Math.sin(x * 0.043 + 4.1);
}

function drawJellyfish(): void {
  // Halo first so the bell sits on top of it.
  glow(JELLY_CX, JELLY_CY - 30, 480, [120, 160, 255], 0.16, 2.2);
  glow(JELLY_CX, JELLY_CY, 380, [150, 110, 255], 0.2, 2);
  glow(JELLY_CX, JELLY_CY + 40, 300, [255, 110, 199], 0.1, 2.4);

  // Bell: per-pixel ellipse with a radial gradient from a bright heart,
  // angular ribs, and a hot rim. Opaque enough to read as a solid creature.
  const x0 = Math.floor(JELLY_CX - JELLY_RX);
  const x1 = Math.ceil(JELLY_CX + JELLY_RX);
  const y0 = Math.floor(JELLY_CY - JELLY_RY);
  const y1 = Math.ceil(JELLY_CY + JELLY_RY * 0.62);
  const lx = JELLY_CX;
  const ly = JELLY_CY - 80;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ex = (x - JELLY_CX) / JELLY_RX;
      const ey = (y - JELLY_CY) / JELLY_RY;
      const e = ex * ex + ey * ey;
      if (e > 1 || y > rimY(x)) continue;
      const d = Math.sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly)) / 330;
      const t = clamp(d, 0, 1);
      let c = t < 0.5 ? mix3(DOME_CORE, DOME_MID, t / 0.5) : mix3(DOME_MID, DOME_RIM, (t - 0.5) / 0.5);
      // Ribs radiating from the bell's heart.
      const ang = Math.atan2(y - (JELLY_CY + 30), x - JELLY_CX);
      const rib = Math.pow(0.5 + 0.5 * Math.sin(ang * 14 + 0.6), 6) * (1 - t) * 0.28;
      c = [c[0] + 255 * rib, c[1] + 255 * rib, c[2] + 255 * rib];
      // Hot rim near the ellipse edge.
      const edge = clamp((e - 0.86) / 0.14, 0, 1);
      c = mix3(c, DOME_EDGE, edge * 0.55);
      // Soft lower fade into the tentacles.
      const fade = y > JELLY_CY + 20 ? clamp(1 - (y - (JELLY_CY + 20)) / 90, 0.45, 1) : 1;
      px(x, y, c[0], c[1], c[2], 0.96 * fade);
    }
  }
  // Bright rim arc along the top of the bell.
  for (let a = Math.PI; a <= Math.PI * 2; a += 0.004) {
    const x = JELLY_CX + Math.cos(a) * (JELLY_RX - 2);
    const y = JELLY_CY + Math.sin(a) * (JELLY_RY - 2);
    disc(x, y, 2.5, [240, 255, 255], 0.75, 1.5);
  }

  // Tentacles: 14 flowing curves from the rim, swaying as they fall,
  // cyan at the root fading to magenta at the tip, drawn in three passes
  // (wide faint glow, medium halo, bright core) for a neon feel.
  const TENTACLES = 14;
  for (let ti = 0; ti < TENTACLES; ti++) {
    const frac = ti / (TENTACLES - 1);
    const x0t = JELLY_CX - JELLY_RX * 0.88 + frac * JELLY_RX * 1.76;
    const y0t = rimY(x0t) - 4;
    const len = 250 + 150 * Math.sin(frac * Math.PI) + rand() * 50;
    const phase = rand() * Math.PI * 2;
    const freq = 1.4 + rand() * 1.1;
    const sway = 24 + rand() * 22;
    const steps = 56;
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pts.push([x0t + Math.sin(t * freq * Math.PI * 2 + phase) * sway * t, y0t + t * len]);
    }
    const col = (t: number): RGB =>
      t < 0.5
        ? mix3([110, 243, 255], [178, 140, 255], t / 0.5)
        : mix3([178, 140, 255], [255, 110, 199], (t - 0.5) / 0.5);
    for (const pass of [
      { w: 3.2, a: 0.1 },
      { w: 1.7, a: 0.22 },
      { w: 1.0, a: 0.85 },
    ]) {
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const w = (7.5 * (1 - t * 0.72) + 1.2) * pass.w;
        thickLine(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], w, col(t), pass.a);
      }
    }
    // Glowing beads drifting down a few tentacles.
    if (ti === 2 || ti === 5 || ti === 9 || ti === 12) {
      for (const bt of [0.35, 0.62, 0.88]) {
        const si = Math.round(bt * steps);
        glow(pts[si][0], pts[si][1], 9, col(bt), 0.5, 2);
        disc(pts[si][0], pts[si][1], 2.5, [255, 255, 255], 0.95, 1);
      }
    }
  }

  // Two soft shafts of light falling from the bell toward the city.
  for (const [sx, tilt] of [
    [430, -30],
    [600, 36],
  ] as Array<[number, number]>) {
    for (let y = JELLY_CY + 90; y < 850; y++) {
      const t = (y - (JELLY_CY + 90)) / (850 - (JELLY_CY + 90));
      const cx = sx + tilt * t;
      const half = 26 + 60 * t;
      const a = 0.05 * (1 - t);
      for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
        const fall = 1 - Math.abs(x - cx) / half;
        px(x, y, 170, 220, 255, a * fall);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// A tiny hot-air balloon rising toward the jellyfish — the human scale.
// ---------------------------------------------------------------------------
function drawBalloon(): void {
  const bx = 782;
  const by = 648;
  glow(bx, by, 70, [255, 150, 110], 0.16, 2.2);
  // Envelope: a filled ellipse with vertical coral/cream stripes.
  for (let y = by - 34; y <= by + 34; y++) {
    const dy = (y - by) / 34;
    const half = 30 * Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = Math.floor(bx - half); x <= Math.ceil(bx + half); x++) {
      const stripe = Math.floor((x - bx + 30) / 12) % 2 === 0;
      const c: RGB = stripe ? [255, 122, 92] : [255, 236, 200];
      px(x, y, c[0], c[1], c[2], 0.98);
    }
  }
  disc(bx - 12, by - 14, 10, [255, 255, 255], 0.35, 4);
  // Ropes and basket.
  thickLine(bx - 16, by + 26, bx - 8, by + 44, 1.5, [90, 60, 40], 0.9);
  thickLine(bx + 16, by + 26, bx + 8, by + 44, 1.5, [90, 60, 40], 0.9);
  rect(bx - 9, by + 44, 18, 13, [107, 66, 38], 1);
  rect(bx - 9, by + 44, 18, 3, [140, 90, 50], 1);
  // A trailing ribbon, fluttering in a smooth wave.
  let rx = bx - 30;
  let ry = by + 8;
  for (let s = 0; s < 12; s++) {
    const nx = rx - 8;
    const ny = by + 8 + Math.sin(s * 0.9) * 7;
    thickLine(rx, ry, nx, ny, 2, [255, 110, 199], 0.9);
    rx = nx;
    ry = ny;
  }
}

// ---------------------------------------------------------------------------
// Caption "LOOK UP." in a tiny 5x7 bitmap font, bottom left above the city.
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00000', '01100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function drawText(text: string, x0: number, y0: number, scale: number, c: RGB, a: number): void {
  let cx = x0;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[' '];
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[r][col] === '1') rect(cx + col * scale, y0 + r * scale, scale, scale, c, a);
      }
    }
    cx += 6 * scale;
  }
}

// ---------------------------------------------------------------------------
// Vignette: darken the corners a touch for a cinematic frame.
// ---------------------------------------------------------------------------
function drawVignette(): void {
  const cx = W / 2;
  const cy = H / 2;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / 720;
      if (d > 0.62) px(x, y, 2, 3, 10, clamp((d - 0.62) * 0.55, 0, 0.22));
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal PNG encoder: truecolour (RGB, 8 bit), filter 0, zlib level 9.
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcData = new Uint8Array(4 + data.length);
  crcData.set(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc32(crcData));
  return out;
}

function encodePNG(): Uint8Array {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: None
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const idat = deflateSync(raw, { level: 9 });
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    png.set(p, off);
    off += p.length;
  }
  return png;
}

// ---------------------------------------------------------------------------
// Main: draw the scene, encode, write /output/entry.png.
// ---------------------------------------------------------------------------
function main(): void {
  drawSky();
  drawCity();
  drawJellyfish();
  drawBalloon();
  drawText('LOOK UP.', 40, 792, 3, [255, 233, 176], 0.92);
  drawVignette();
  const png = encodePNG();
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
  console.log(`wrote ${join(outDir, 'entry.png')} (${png.length} bytes, ${W}x${H})`);
}

main();
