import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

// "Look up." — a procedural night scene, drawn pixel by pixel.
// A giant glowing jellyfish drifts over a sleeping little city while a
// coral-and-cream balloon floats by and the moon watches. Everything is
// computed in this file: no network, no assets, no randomness outside a
// single seeded generator, so every run paints the exact same picture.

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Deterministic random numbers: mulberry32 with a fixed seed. Every random
// draw happens in the same order on every run, so the picture is stable.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20261116);

// ---------------------------------------------------------------------------
// Framebuffer and tiny paint helpers (colors are [r, g, b], 0-255).
// ---------------------------------------------------------------------------
const px = new Uint8Array(W * H * 4);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: number[], c2: number[], t: number): number[] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

function blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  const inv = 1 - a;
  px[i] = r * a + px[i] * inv;
  px[i + 1] = g * a + px[i + 1] * inv;
  px[i + 2] = b * a + px[i + 2] * inv;
  px[i + 3] = 255;
}

function fillRect(x0: number, y0: number, w: number, h: number, c: number[], a: number): void {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      blend(x, y, c[0], c[1], c[2], a);
    }
  }
}

// Solid disc with a one-pixel soft edge.
function disc(cx: number, cy: number, rad: number, c: number[], a: number): void {
  const x0 = Math.max(0, Math.floor(cx - rad - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad + 1));
  const y0 = Math.max(0, Math.floor(cy - rad - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= rad) {
        let aa = a;
        if (d > rad - 1) aa = a * (rad - d);
        blend(x, y, c[0], c[1], c[2], aa);
      }
    }
  }
}

// Soft radial glow: brightest in the middle, fading out quadratically.
function glow(cx: number, cy: number, rad: number, c: number[], peak: number): void {
  const x0 = Math.max(0, Math.floor(cx - rad));
  const x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < rad) {
        const f = 1 - d / rad;
        blend(x, y, c[0], c[1], c[2], peak * f * f);
      }
    }
  }
}

// A thick polyline made of discs, for ropes, curves and tentacles.
function stroke(points: number[][], rad: number, c: number[], a: number): void {
  for (let s = 0; s < points.length - 1; s++) {
    const ax = points[s][0];
    const ay = points[s][1];
    const bx = points[s + 1][0];
    const by = points[s + 1][1];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      disc(lerp(ax, bx, t), lerp(ay, by, t), rad, c, a);
    }
  }
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------
const CYAN: number[] = [55, 230, 255];
const VIOLET: number[] = [139, 92, 246];
const MAGENTA: number[] = [255, 79, 216];
const CREAM: number[] = [255, 240, 214];
const CORAL: number[] = [255, 122, 107];

function jellyColor(t: number): number[] {
  // Cyan at the top of the jellyfish, violet in the middle, magenta below.
  if (t < 0.5) return mix(CYAN, VIOLET, t / 0.5);
  return mix(VIOLET, MAGENTA, (t - 0.5) / 0.5);
}

// ---------------------------------------------------------------------------
// 1. Night sky: deep indigo up top, warming toward the horizon.
// ---------------------------------------------------------------------------
const SKY_STOPS: number[][] = [
  [7, 13, 36],
  [24, 20, 58],
  [58, 32, 80],
  [44, 26, 66],
];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const seg = clamp(t * (SKY_STOPS.length - 1), 0, SKY_STOPS.length - 1);
  const i0 = Math.floor(seg);
  const i1 = Math.min(SKY_STOPS.length - 1, i0 + 1);
  const base = mix(SKY_STOPS[i0], SKY_STOPS[i1], seg - i0);
  // A warm band of dusk light hugging the horizon.
  const warm = Math.exp(-((y - 800) * (y - 800)) / (2 * 70 * 70));
  const r = clamp(base[0] + 74 * warm, 0, 255);
  const g = clamp(base[1] + 46 * warm, 0, 255);
  const b = clamp(base[2] + 62 * warm, 0, 255);
  for (let x = 0; x < W; x++) {
    const p = (y * W + x) * 4;
    px[p] = r;
    px[p + 1] = g;
    px[p + 2] = b;
    px[p + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// 2. Stars.
// ---------------------------------------------------------------------------
for (let s = 0; s < 220; s++) {
  const x = rng() * W;
  const y = rng() * 680;
  const r = 0.6 + rng() * 1.1;
  const bright = 0.35 + rng() * 0.65;
  const c = rng() < 0.3 ? [170, 210, 255] : [255, 255, 240];
  glow(x, y, r * 3, c, 0.25 * bright);
  disc(x, y, r, c, bright);
}

// ---------------------------------------------------------------------------
// 3. The moon, upper right, with a soft halo and a few craters.
// ---------------------------------------------------------------------------
const MOON_X = 830;
const MOON_Y = 150;
glow(MOON_X, MOON_Y, 150, [240, 230, 200], 0.22);
glow(MOON_X, MOON_Y, 92, [245, 238, 214], 0.45);
disc(MOON_X, MOON_Y, 62, [245, 238, 214], 1);
for (let k = 0; k < 7; k++) {
  const ang = rng() * Math.PI * 2;
  const dist = rng() * 42;
  const cr = 5 + rng() * 7;
  disc(MOON_X + Math.cos(ang) * dist, MOON_Y + Math.sin(ang) * dist, cr, [214, 204, 176], 0.8);
}

// ---------------------------------------------------------------------------
// 4. Low dark hills on the horizon.
// ---------------------------------------------------------------------------
for (let x = 0; x < W; x++) {
  const hillY = 800 + Math.sin(x * 0.008) * 14 + Math.sin(x * 0.021 + 1.7) * 8;
  for (let y = Math.floor(hillY); y < 832; y++) {
    blend(x, y, 13, 16, 38, 1);
  }
}

// ---------------------------------------------------------------------------
// 5. The jellyfish: halo, dome, ribs, frill, then fourteen tentacles.
// ---------------------------------------------------------------------------
const JX = 512;
const JY = 400;
const JRX = 250;
const JRY = 185;

glow(JX, JY, 330, [80, 120, 255], 0.26);
glow(JX, JY + 20, 260, [190, 90, 255], 0.2);

// Dome: an ellipse whose colour runs cyan -> violet -> magenta downwards,
// brighter toward the middle and rim-lit at the edge.
for (let y = Math.floor(JY - JRY); y <= Math.ceil(JY + JRY); y++) {
  for (let x = Math.floor(JX - JRX); x <= Math.ceil(JX + JRX); x++) {
    const nx = (x - JX) / JRX;
    const ny = (y - JY) / JRY;
    const e = nx * nx + ny * ny;
    if (e > 1) continue;
    const vt = clamp((y - (JY - JRY)) / (2 * JRY), 0, 1);
    let col = jellyColor(vt);
    const d = Math.sqrt(e);
    // Bright glowing core near the top-middle of the bell.
    const core = Math.pow(1 - d, 2) * 0.55;
    col = [lerp(col[0], 255, core * 0.6), lerp(col[1], 255, core * 0.6), lerp(col[2], 255, core * 0.5)];
    // Pale rim light right at the edge of the bell.
    if (e > 0.92) {
      const rim = ((e - 0.92) / 0.08) * 0.7;
      col = mix(col, [255, 180, 245], rim);
    }
    blend(x, y, col[0], col[1], col[2], 0.96);
  }
}

// Nine pale ribs fanning down from the top of the bell.
for (let k = 0; k < 9; k++) {
  const endX = JX + (k - 4) * 52;
  const pts: number[][] = [];
  for (let s = 0; s <= 24; s++) {
    const t = s / 24;
    pts.push([lerp(JX, endX, t) + Math.sin(t * 2.2 + k) * 10 * t, lerp(JY - 150, JY + 140, t)]);
  }
  stroke(pts, 5, [255, 255, 255], 0.12);
}

// A short wavy frill under the middle of the bell.
for (let k = 0; k < 5; k++) {
  const startX = JX + (k - 2) * 36;
  const len = 42 + (k % 3) * 9;
  const pts: number[][] = [];
  for (let s = 0; s <= 14; s++) {
    const t = s / 14;
    pts.push([startX + Math.sin(t * 5 + k * 1.3) * 7, JY + 168 + t * len]);
  }
  stroke(pts, 4, [230, 200, 255], 0.5);
}

// Fourteen flowing tentacles. Their lengths, sway and phase are drawn from
// the seeded generator first (fixed order), then painted in two passes:
// a wide faint glow pass, then the bright core pass.
const TENTACLES: number[][] = [];
for (let i = 0; i < 14; i++) {
  const anchorX = JX - 210 + (i * 420) / 13;
  const rel = (anchorX - JX) / JRX;
  const anchorY = JY + JRY * Math.sqrt(Math.max(0, 1 - rel * rel)) - 6;
  const len = 250 + rng() * 90;
  const phase = rng() * Math.PI * 2;
  const sway = 26 + rng() * 30;
  TENTACLES.push([anchorX, anchorY, len, phase, sway]);
}
function tentaclePoints(t: number[]): number[][] {
  const pts: number[][] = [];
  const steps = Math.floor(t[2] / 5);
  for (let s = 0; s <= steps; s++) {
    const prog = s / steps;
    const y = t[1] + s * 5;
    const x =
      t[0] +
      Math.sin(s * 5 * 0.014 + t[3]) * t[4] * prog +
      Math.sin(s * 5 * 0.004 + t[3] * 2) * 8 * prog;
    pts.push([x, y]);
  }
  return pts;
}
for (const t of TENTACLES) {
  const pts = tentaclePoints(t);
  for (let s = 0; s < pts.length; s++) {
    const prog = s / (pts.length - 1);
    disc(pts[s][0], pts[s][1], lerp(7, 1.6, prog) * 2.6, jellyColor(prog), 0.1);
  }
}
for (const t of TENTACLES) {
  const pts = tentaclePoints(t);
  for (let s = 0; s < pts.length; s++) {
    const prog = s / (pts.length - 1);
    disc(pts[s][0], pts[s][1], lerp(7, 1.6, prog), jellyColor(prog), 0.92);
  }
  const tip = pts[pts.length - 1];
  disc(tip[0], tip[1], 4, [255, 220, 250], 0.9);
}

// ---------------------------------------------------------------------------
// 6. The coral-and-cream balloon, drifting left of the jellyfish.
// ---------------------------------------------------------------------------
const BX = 185;
const BY = 300;
glow(BX, BY, 80, [255, 140, 110], 0.18);
for (let y = BY - 46; y <= BY + 46; y++) {
  for (let x = BX - 46; x <= BX + 46; x++) {
    const dx = x - BX;
    const dy = y - BY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 46) continue;
    const stripe = Math.floor((x - (BX - 46)) / 14) % 2 === 0 ? CORAL : [255, 232, 201];
    const shade = 0.82 + 0.18 * (1 - d / 46);
    blend(x, y, stripe[0] * shade, stripe[1] * shade, stripe[2] * shade, 1);
  }
}
glow(BX - 14, BY - 16, 20, [255, 255, 255], 0.25);
stroke(
  [
    [BX - 26, BY + 40],
    [BX - 10, BY + 54],
  ],
  1.5,
  [90, 60, 35],
  0.9
);
stroke(
  [
    [BX + 26, BY + 40],
    [BX + 10, BY + 54],
  ],
  1.5,
  [90, 60, 35],
  0.9
);
fillRect(BX - 13, BY + 54, 26, 18, [120, 72, 40], 1);
fillRect(BX - 13, BY + 54, 26, 4, [146, 92, 52], 1);

// ---------------------------------------------------------------------------
// 7. The sleeping city: dark rooftops, a few lit windows, one little church.
// ---------------------------------------------------------------------------
let cx = 0;
while (cx < W) {
  const bw = 46 + rng() * 44;
  const bh = 90 + rng() * 130;
  const shade = 8 + rng() * 10;
  const col = [shade, shade + 3, shade + 18];
  const top = 1024 - bh;
  fillRect(Math.floor(cx), Math.floor(top), Math.ceil(bw), Math.ceil(bh), col, 1);
  // Rooftop: a pointed roof, or a flat roof with a thin antenna.
  if (rng() < 0.35) {
    const apex = 18 + rng() * 22;
    for (let ry = 0; ry < apex; ry++) {
      const half = ((bw / 2) * (apex - ry)) / apex;
      fillRect(Math.floor(cx + bw / 2 - half), Math.floor(top - apex + ry), Math.ceil(half * 2), 1, col, 1);
    }
  } else if (rng() < 0.25) {
    fillRect(Math.floor(cx + bw / 2 - 1), Math.floor(top - 26), 3, 26, col, 1);
    disc(cx + bw / 2, top - 28, 2.5, [255, 80, 80], 0.9);
  }
  // Windows: most dark, some warmly lit, a few cool.
  const cols = Math.floor((bw - 12) / 12);
  const rows = Math.floor((bh - 16) / 14);
  for (let wy = 0; wy < rows; wy++) {
    for (let wx = 0; wx < cols; wx++) {
      const wx0 = Math.floor(cx + 7 + wx * 12);
      const wy0 = Math.floor(top + 10 + wy * 14);
      if (rng() < 0.42) {
        const lit = rng() < 0.7 ? [255, 205, 120] : [150, 210, 255];
        fillRect(wx0, wy0, 5, 7, lit, 0.95);
      } else {
        fillRect(wx0, wy0, 5, 7, [20, 24, 48], 1);
      }
    }
  }
  cx += bw + 2;
}

// A small church with a steeple near the right edge.
fillRect(868, 904, 62, 120, [9, 11, 30], 1);
for (let ry = 0; ry < 44; ry++) {
  const half = (31 * (44 - ry)) / 44;
  fillRect(Math.floor(899 - half), 904 - 44 + ry, Math.ceil(half * 2), 1, [9, 11, 30], 1);
}
fillRect(897, 848, 4, 14, [9, 11, 30], 1);
fillRect(892, 853, 14, 4, [9, 11, 30], 1);
fillRect(892, 950, 8, 12, [255, 205, 120], 0.95);
fillRect(916, 950, 8, 12, [255, 205, 120], 0.95);

// ---------------------------------------------------------------------------
// 8. Fireflies drifting up from the rooftops.
// ---------------------------------------------------------------------------
for (let f = 0; f < 46; f++) {
  const x = rng() * W;
  const y = 700 + rng() * 220;
  const r = 1 + rng() * 1;
  const c = rng() < 0.5 ? [190, 255, 220] : [255, 220, 150];
  glow(x, y, 5, c, 0.35);
  disc(x, y, r, c, 0.5 + rng() * 0.5);
}

// ---------------------------------------------------------------------------
// 9. The words "LOOK UP." on a quiet dark banner across the lower city.
// ---------------------------------------------------------------------------
const GLYPHS: Record<string, string[]> = {
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  K: ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  ".": [".....", ".....", ".....", ".....", ".....", ".....", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

function drawText(text: string, x0: number, y0: number, scale: number, c: number[], a: number): void {
  let pen = x0;
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "#") {
          fillRect(pen + col * scale, y0 + row * scale, scale, scale, c, a);
        }
      }
    }
    pen += 6 * scale;
  }
}

fillRect(320, 910, 384, 76, [5, 8, 24], 0.45);
drawText("LOOK UP.", 347, 925, 7, [120, 60, 200], 0.35);
drawText("LOOK UP.", 347, 923, 7, CREAM, 1);

// ---------------------------------------------------------------------------
// PNG encoder, written from scratch: signature, IHDR, one IDAT with zlib
// deflate (filter 0 on every scanline), IEND, and a table-driven CRC32.
// ---------------------------------------------------------------------------
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type 6: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 4);
    raw[off] = 0;
    raw.set(px.subarray(y * W * 4, (y + 1) * W * 4), off + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Write the single output image.
// ---------------------------------------------------------------------------
const outDir = (process.env.MAKEFUN_OUTPUT_DIR || "/output").replace(/\/+$/, "") || "/";
const png = encodePng();
mkdirSync(outDir, { recursive: true });
writeFileSync(outDir + "/entry.png", png);
console.log("wrote " + outDir + "/entry.png (" + png.length + " bytes)");
