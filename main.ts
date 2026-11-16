// Look up. — ai-excited-01
//
// A fully procedural, deterministic 1024x1024 PNG: a giant glowing
// jellyfish drifts over a small sleeping town, its tentacles trailing
// light, a coral hot-air balloon floats by, the moon watches, and the
// words LOOK UP. sit at the bottom of the frame.
//
// How it works, in one paragraph: every pixel is painted by hand into
// an RGBA buffer — a vertical night-sky gradient, deterministic stars,
// a pale moon, a dark town silhouette with warm lit windows, a jellyfish
// bell shaded cyan -> violet -> magenta, fourteen flowing light
// tentacles, a coral-and-cream balloon, and block-letter text drawn
// from a tiny built-in 5x7 bitmap font. The PNG bytes are encoded by
// hand too (IHDR / IDAT / IEND chunks, zlib deflate, a small CRC32
// table), so the program needs nothing but node:fs and node:zlib.
//
// Determinism: one mulberry32 generator with a fixed seed drives every
// random choice, always in the same call order, and nothing reads the
// clock, the network, or the environment except MAKEFUN_OUTPUT_DIR.
// Run it twice and the two files are byte-identical.
//
// Usage:
//   node main.ts
//   MAKEFUN_OUTPUT_DIR=/some/dir node main.ts   # writes /some/dir/entry.png
//   (no MAKEFUN_OUTPUT_DIR set: writes /output/entry.png)

import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32, fixed seed) — the only source of chance.
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261116);

// ---------------------------------------------------------------------------
// Pixel buffer + tiny raster helpers
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

const buf = new Uint8ClampedArray(W * H * 4);

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix3(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// Blend one pixel toward `color` with coverage alpha in [0, 1].
function plot(x: number, y: number, color: RGB, alpha: number): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H || alpha <= 0) return;
  const i = (yi * W + xi) * 4;
  const a = alpha > 1 ? 1 : alpha;
  buf[i] = Math.round(lerp(buf[i], color[0], a));
  buf[i + 1] = Math.round(lerp(buf[i + 1], color[1], a));
  buf[i + 2] = Math.round(lerp(buf[i + 2], color[2], a));
  buf[i + 3] = 255;
}

function disc(cx: number, cy: number, r: number, color: RGB, alpha: number): void {
  if (r <= 0) return;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      // Soft edge: full strength inside, fading out in the outer ring.
      const edge = d < 0.75 ? 1 : 1 - (d - 0.75) / 0.25;
      plot(x, y, color, alpha * edge);
    }
  }
}

function rect(x0: number, y0: number, x1: number, y1: number, color: RGB, alpha = 1): void {
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(W - 1, Math.ceil(x1)); x++) {
      plot(x, y, color, alpha);
    }
  }
}

// A thick, soft polyline through points — used for tentacles and strings.
function stroke(points: Array<[number, number]>, radius: number, color: RGB, alpha: number): void {
  for (let s = 0; s < points.length - 1; s++) {
    const [ax, ay] = points[s];
    const [bx, by] = points[s + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      disc(lerp(ax, bx, t), lerp(ay, by, t), radius, color, alpha);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Night sky: deep indigo at the top warming to violet-magenta at the horizon
// ---------------------------------------------------------------------------
const SKY_TOP: RGB = [10, 14, 46];
const SKY_MID: RGB = [26, 20, 69];
const SKY_LOW: RGB = [58, 28, 88];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const c = t < 0.55 ? mix3(SKY_TOP, SKY_MID, t / 0.55) : mix3(SKY_MID, SKY_LOW, (t - 0.55) / 0.45);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    buf[i] = c[0];
    buf[i + 1] = c[1];
    buf[i + 2] = c[2];
    buf[i + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// 2. Stars — 240 of them, brighter and sparser near the top
// ---------------------------------------------------------------------------
for (let s = 0; s < 240; s++) {
  const x = rand() * W;
  const y = Math.pow(rand(), 1.6) * 700; // denser up high
  const bright = 140 + rand() * 115;
  const r = rand() < 0.12 ? 2.2 : 1.1;
  const warm: RGB = [bright, bright, Math.min(255, bright + 20)];
  disc(x, y, r, warm, 0.35 + rand() * 0.6);
  if (rand() < 0.08) {
    // A few four-point sparkles.
    rect(x - 5, y - 0.5, x + 5, y + 0.5, warm, 0.5);
    rect(x - 0.5, y - 5, x + 0.5, y + 5, warm, 0.5);
  }
}

// ---------------------------------------------------------------------------
// 3. Moon — pale disc with a soft halo and a few darker maria
// ---------------------------------------------------------------------------
const MOON: [number, number, number] = [828, 168, 66];
disc(MOON[0], MOON[1], MOON[2] + 42, [214, 206, 235], 0.10);
disc(MOON[0], MOON[1], MOON[2] + 18, [226, 220, 242], 0.16);
disc(MOON[0], MOON[1], MOON[2], [243, 238, 250], 1);
disc(MOON[0] - 20, MOON[1] - 12, 13, [214, 208, 228], 0.55);
disc(MOON[0] + 18, MOON[1] + 16, 9, [218, 212, 230], 0.5);
disc(MOON[0] + 6, MOON[1] - 26, 7, [220, 214, 232], 0.45);

// ---------------------------------------------------------------------------
// 4. Distant hills + the sleeping town
// ---------------------------------------------------------------------------
// Two rolling hill bands behind the rooftops.
for (let x = 0; x < W; x++) {
  const hill = 768 + Math.sin(x * 0.006 + 1.2) * 16 + Math.sin(x * 0.017) * 7;
  for (let y = Math.floor(hill); y < H; y++) {
    plot(x, y, [16, 14, 40], 0.85);
  }
}

const TOWN_TOP = 800;
const ROOF: RGB = [13, 12, 34];
const WALL: RGB = [19, 17, 44];
let bx = -12;
while (bx < W) {
  const bw = 52 + rand() * 74;
  const bh = 92 + rand() * 118;
  const top = TOWN_TOP + 60 - bh;
  // Pitched roof.
  for (let y = 0; y < 26; y++) {
    const inset = (y / 26) * (bw / 2);
    rect(bx + inset, top - 26 + y, bx + bw - inset, top - 25 + y, ROOF);
  }
  rect(bx, top, bx + bw, TOWN_TOP + 60, WALL);
  // A chimney on about half the houses.
  if (rand() < 0.5) {
    const cx = bx + 8 + rand() * (bw - 24);
    rect(cx, top - 44, cx + 12, top - 24, ROOF);
  }
  // Warm lit windows: most houses have one or two still awake.
  const cols = Math.max(1, Math.floor(bw / 30));
  const rows = Math.max(1, Math.floor(bh / 46));
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (rand() < 0.42) {
        const wx = bx + 10 + c * 28;
        const wy = top + 16 + r * 44;
        const amber: RGB = rand() < 0.75 ? [255, 196, 110] : [255, 226, 160];
        rect(wx, wy, wx + 11, wy + 15, amber, 0.92);
        // Window glow spilling onto the wall.
        disc(wx + 5, wy + 7, 16, amber, 0.10);
      }
    }
  }
  bx += bw + 4 + rand() * 14;
}
// Street level: a dark foreground band and a few sleepy street lamps.
rect(0, TOWN_TOP + 60, W, H, [10, 9, 28]);
for (let lx = 70; lx < W; lx += 150) {
  rect(lx, TOWN_TOP + 62, lx + 3, TOWN_TOP + 118, [24, 22, 52]);
  disc(lx + 1, TOWN_TOP + 58, 7, [255, 205, 120], 0.95);
  disc(lx + 1, TOWN_TOP + 58, 26, [255, 205, 120], 0.12);
}

// ---------------------------------------------------------------------------
// 5. The jellyfish — bell first, then its fourteen tentacles
// ---------------------------------------------------------------------------
const JX = 512;
const JY = 392;
const JRX = 298;
const JRY = 196;

const CYAN: RGB = [72, 226, 255];
const VIOLET: RGB = [150, 102, 255];
const MAGENTA: RGB = [255, 92, 198];

function bellColor(t: number): RGB {
  return t < 0.5 ? mix3(CYAN, VIOLET, t / 0.5) : mix3(VIOLET, MAGENTA, (t - 0.5) / 0.5);
}

// Bell body: an ellipse shaded top-to-bottom, with a bright core near the
// upper-left and a glowing rim. A scalloped lower edge is faked with a row
// of small discs drawn right after.
for (let y = JY - JRY; y <= JY + JRY; y++) {
  for (let x = JX - JRX; x <= JX + JRX; x++) {
    const nx = (x - JX) / JRX;
    const ny = (y - JY) / JRY;
    const d2 = nx * nx + ny * ny;
    if (d2 > 1) continue;
    const t = clamp((y - (JY - JRY)) / (2 * JRY), 0, 1);
    let c = bellColor(t);
    // Bright core: a soft highlight around the upper-left of the bell.
    const core = Math.max(0, 1 - Math.hypot(x - 428, y - 306) / 210);
    c = mix3(c, [235, 252, 255], core * 0.45);
    // Rim glow: brighter right at the ellipse boundary.
    const rim = clamp((d2 - 0.82) / 0.18, 0, 1);
    c = mix3(c, [255, 255, 255], rim * 0.35);
    // The bell is translucent: the sky shows through a little.
    plot(x, y, c, 0.88);
  }
}
// Scalloped fringe along the bell's lower edge.
for (let k = 0; k < 26; k++) {
  const fx = JX - JRX + 12 + (k / 25) * (2 * JRX - 24);
  const nx = (fx - JX) / JRX;
  const fy = JY + JRY * Math.sqrt(Math.max(0, 1 - nx * nx));
  const t = clamp((fy - (JY - JRY)) / (2 * JRY), 0, 1);
  disc(fx, fy + 4, 15 + 5 * Math.sin(k * 1.7), bellColor(t), 0.85);
}
// Inner ribs: a few curved arcs suggesting the bell's structure.
for (let rib = 0; rib < 5; rib++) {
  const pts: Array<[number, number]> = [];
  const spread = (rib - 2) * 0.32;
  for (let s = 0; s <= 20; s++) {
    const tt = s / 20;
    const px = JX + Math.sin(spread + tt * 0.5) * JRX * 0.62 * tt;
    const py = JY - JRY + 26 + tt * (JRY * 1.55);
    pts.push([px, py]);
  }
  stroke(pts, 3, [255, 255, 255], 0.16);
}

// Fourteen tentacles, flowing down from the bell's rim. Each one sways
// with its own sine phase, tapers as it falls, and fades from cyan at
// the top to magenta at its tip.
const TENTACLES = 14;
for (let i = 0; i < TENTACLES; i++) {
  const startX = JX - JRX + 26 + (i / (TENTACLES - 1)) * (2 * JRX - 52);
  const nx = (startX - JX) / JRX;
  const startY = JY + JRY * Math.sqrt(Math.max(0, 1 - nx * nx)) - 6;
  const len = 250 + rand() * 210;
  const phase = rand() * Math.PI * 2;
  const sway = 26 + rand() * 34;
  const freq = 1.6 + rand() * 1.4;
  const segs = 46;
  // Wide, faint under-glow first, then the bright core on top.
  for (const pass of [0, 1]) {
    const pts: Array<[number, number]> = [];
    for (let s = 0; s <= segs; s++) {
      const tt = s / segs;
      const px = startX + Math.sin(phase + tt * freq * Math.PI) * sway * tt;
      const py = startY + tt * len;
      pts.push([px, py]);
    }
    const radius = pass === 0 ? 7 : 3;
    const alpha = pass === 0 ? 0.14 : 0.75;
    // Recolor along the path: draw segment by segment so the gradient
    // runs cyan -> violet -> magenta down each tentacle.
    for (let s = 0; s < pts.length - 1; s++) {
      const tt = s / (pts.length - 1);
      const c = bellColor(tt);
      const taper = 1 - tt * 0.72;
      const [ax, ay] = pts[s];
      const [bx2, by2] = pts[s + 1];
      const steps = Math.max(2, Math.ceil(Math.hypot(bx2 - ax, by2 - ay) / 2));
      for (let k = 0; k <= steps; k++) {
        const u = k / steps;
        disc(lerp(ax, bx2, u), lerp(ay, by2, u), radius * taper, c, alpha * (1 - tt * 0.35));
      }
    }
  }
  // A glowing bead at the tip.
  const tipX = startX + Math.sin(phase + freq * Math.PI) * sway;
  disc(tipX, startY + len, 5, MAGENTA, 0.9);
  disc(tipX, startY + len, 11, MAGENTA, 0.18);
}

// A soft halo of light the jellyfish casts on the rooftops below it.
disc(JX, 800, 240, [150, 110, 255], 0.07);
disc(JX, 800, 130, [255, 120, 210], 0.06);

// ---------------------------------------------------------------------------
// 6. Hot-air balloon — coral envelope, cream band, little basket
// ---------------------------------------------------------------------------
const BALLOON_X = 168;
const BALLOON_Y = 268;
const BALLOON_R = 52;
disc(BALLOON_X, BALLOON_Y, BALLOON_R + 26, [255, 138, 122], 0.12);
disc(BALLOON_X, BALLOON_Y, BALLOON_R, [255, 138, 122], 1);
// Cream band across the middle, clipped to the envelope: draw it row
// by row, each row only as wide as the circle is at that height.
for (let y = BALLOON_Y - 8; y <= BALLOON_Y + 10; y++) {
  const dy = y - BALLOON_Y;
  const half = Math.sqrt(Math.max(0, BALLOON_R * BALLOON_R - dy * dy));
  rect(BALLOON_X - half, y, BALLOON_X + half, y, [250, 232, 200], 1);
}
// Envelope seams.
for (const off of [-26, 0, 26]) {
  const pts: Array<[number, number]> = [];
  for (let s = 0; s <= 12; s++) {
    const tt = s / 12;
    pts.push([BALLOON_X + off * (1 - tt * 0.4), BALLOON_Y - BALLOON_R + 6 + tt * (2 * BALLOON_R - 12)]);
  }
  stroke(pts, 1.5, [214, 96, 84], 0.55);
}
// Highlight on the envelope's upper-left.
disc(BALLOON_X - 20, BALLOON_Y - 24, 14, [255, 214, 200], 0.5);
// Ropes down to the basket.
stroke([[BALLOON_X - 26, BALLOON_Y + 44], [BALLOON_X - 10, BALLOON_Y + 82]], 1.5, [240, 224, 200], 0.9);
stroke([[BALLOON_X + 26, BALLOON_Y + 44], [BALLOON_X + 10, BALLOON_Y + 82]], 1.5, [240, 224, 200], 0.9);
stroke([[BALLOON_X, BALLOON_Y + 50], [BALLOON_X, BALLOON_Y + 82]], 1.5, [240, 224, 200], 0.9);
rect(BALLOON_X - 13, BALLOON_Y + 82, BALLOON_X + 13, BALLOON_Y + 104, [122, 82, 52], 1);
rect(BALLOON_X - 13, BALLOON_Y + 82, BALLOON_X + 13, BALLOON_Y + 88, [150, 104, 66], 1);

// ---------------------------------------------------------------------------
// 7. The words: LOOK UP. in a hand-built 5x7 bitmap font
// ---------------------------------------------------------------------------
const FONT: Record<string, string[]> = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

function drawText(text: string, cx: number, top: number, scale: number, color: RGB, alpha: number): void {
  const charW = 5 * scale + scale; // glyph + one-column gap
  const totalW = text.length * charW - scale;
  let x = cx - totalW / 2;
  for (const ch of text) {
    const glyph = FONT[ch] ?? FONT[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === "1") {
          rect(x + col * scale, top + row * scale, x + (col + 1) * scale - 1, top + (row + 1) * scale - 1, color, alpha);
        }
      }
    }
    x += charW;
  }
}

// Magenta glow behind the letters, then the cream letters themselves.
drawText("LOOK UP.", 512, 898, 9, MAGENTA, 0.55);
drawText("LOOK UP.", 508, 894, 9, [250, 240, 214], 1);

// ---------------------------------------------------------------------------
// 8. Hand-rolled PNG encoder (zlib deflate + CRC32, stdlib only)
// ---------------------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type 6 = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  // One filter byte (0 = none) per scanline, then the raw RGBA rows.
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    Buffer.from(buf.buffer, y * W * 4, W * 4).copy(raw, y * (1 + W * 4) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 9. Write exactly one file: <MAKEFUN_OUTPUT_DIR or /output>/entry.png
// ---------------------------------------------------------------------------
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const png = encodePng();
writeFileSync(`${outDir}/entry.png`, png);
console.log(`wrote ${outDir}/entry.png (${png.length} bytes, ${W}x${H})`);
