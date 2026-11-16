// "Look up." — a giant glowing jellyfish drifts above a small sleeping city.
// Procedural, deterministic, stdlib only. Node 22. No network, no external assets.
// Writes a single 1024x1024 PNG to $MAKEFUN_OUTPUT_DIR/entry.png (default /output).
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { join } from "node:path";

const W = 1024;
const H = 1024;
const buf = new Uint8Array(W * H * 3);

// ---- seeded PRNG (mulberry32), fixed call order, no Date/Math.random ----
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
const rnd = mulberry32(20261116);
const rand = (lo: number, hi: number) => lo + rnd() * (hi - lo);

// ---- pixel helpers (all channels clamped to 0..255 before writing) ----
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function put(x: number, y: number, r: number, g: number, b: number, a = 1): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H || a <= 0) return;
  const i = (yi * W + xi) * 3;
  if (a >= 1) {
    buf[i] = clamp255(r);
    buf[i + 1] = clamp255(g);
    buf[i + 2] = clamp255(b);
  } else {
    buf[i] = clamp255(buf[i] * (1 - a) + r * a);
    buf[i + 1] = clamp255(buf[i + 1] * (1 - a) + g * a);
    buf[i + 2] = clamp255(buf[i + 2] * (1 - a) + b * a);
  }
}
function disc(cx: number, cy: number, rad: number, r: number, g: number, b: number, a: number): void {
  const r0 = Math.max(0, Math.floor(cx - rad));
  const r1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad));
  const y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    for (let x = r0; x <= r1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= rad) put(x, y, r, g, b, a * (1 - d / (rad + 0.6)));
    }
  }
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type RGB = [number, number, number];
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---- 1. sky: vertical gradient ----
const SKY_TOP: RGB = [13, 17, 52];
const SKY_MID: RGB = [16, 19, 58];
const SKY_HOR: RGB = [52, 32, 84];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const c = t < 0.5 ? mix(SKY_TOP, SKY_MID, t / 0.5) : mix(SKY_MID, SKY_HOR, (t - 0.5) / 0.5);
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 3;
    buf[i] = clamp255(c[0]);
    buf[i + 1] = clamp255(c[1]);
    buf[i + 2] = clamp255(c[2]);
  }
}

// ---- milky-way band: ~900 dim dots along a diagonal in the upper sky ----
for (let n = 0; n < 900; n++) {
  const x = rnd() * W;
  // diagonal band: y rises with x, with a soft spread
  const bandY = 40 + x * 0.32 + (rnd() - 0.5) * 190 + (rnd() - 0.5) * 60;
  const y = bandY + (rnd() - 0.5) * 30;
  if (y < 0 || y > 560) continue;
  const br = 40 + rnd() * 90;
  const tint: RGB = rnd() < 0.5 ? [200, 210, 255] : [255, 225, 200];
  put(x, y, tint[0] * (br / 255), tint[1] * (br / 255), tint[2] * (br / 255), 0.25 + rnd() * 0.45);
}

// ---- stars: ~340, mostly 1px; ~5% bright with a 4-way cross sparkle ----
for (let n = 0; n < 340; n++) {
  const x = rnd() * W;
  const y = rnd() * 700;
  const bright = rnd() < 0.05;
  const v = bright ? 255 : 150 + rnd() * 105;
  const warm = rnd() < 0.3;
  const c: RGB = warm ? [255, 240, 210] : [225, 235, 255];
  if (bright) {
    const arm = 3 + Math.floor(rnd() * 3);
    for (let k = -arm; k <= arm; k++) {
      const f = 1 - Math.abs(k) / (arm + 1);
      put(x + k, y, c[0], c[1], c[2], 0.85 * f);
      put(x, y + k, c[0], c[1], c[2], 0.85 * f);
    }
    disc(x, y, 1.6, c[0], c[1], c[2], 0.9);
  } else {
    put(x, y, (c[0] * v) / 255, (c[1] * v) / 255, (c[2] * v) / 255, 0.55 + rnd() * 0.45);
  }
}

// ---- moon at (148,138), r44, warm glow + 3 dim craters ----
for (let g = 0; g < 5; g++) {
  disc(148, 138, 44 + g * 9, 250, 238, 200, 0.10 - g * 0.018);
}
disc(148, 138, 44, 242, 236, 214, 1);
disc(132, 126, 8, 214, 206, 182, 0.8);
disc(162, 150, 6, 214, 206, 182, 0.7);
disc(146, 158, 5, 220, 212, 190, 0.7);

// ---- 2. city at the bottom: ~26 buildings, windows, antennas, tall tower ----
const CITY_BASE = H;
let bx = -6;
const buildings: { x: number; w: number; h: number }[] = [];
for (let n = 0; n < 26; n++) {
  const w = 30 + rnd() * 44;
  const h = 70 + rnd() * 130;
  buildings.push({ x: bx, w, h });
  bx += w + rnd() * 6;
}
for (const b of buildings) {
  const top = CITY_BASE - b.h;
  const shade = 8 + rnd() * 8;
  const bc: RGB = [shade, shade + 4, shade + 14];
  for (let y = Math.max(0, Math.floor(top)); y < CITY_BASE; y++) {
    for (let x = Math.max(0, Math.floor(b.x)); x < Math.min(W, Math.ceil(b.x + b.w)); x++) {
      put(x, y, bc[0], bc[1], bc[2], 1);
    }
  }
  // windows: 4x6 on an 11x15 grid, ~42% warm-lit, some cool blue
  for (let wy = top + 12; wy < CITY_BASE - 10; wy += 15) {
    for (let wx = b.x + 7; wx < b.x + b.w - 8; wx += 11) {
      const roll = rnd();
      if (roll < 0.42) {
        for (let dy = 0; dy < 6; dy++)
          for (let dx = 0; dx < 4; dx++) put(wx + dx, wy + dy, 255, 210, 125, 0.9);
      } else if (roll < 0.52) {
        for (let dy = 0; dy < 6; dy++)
          for (let dx = 0; dx < 4; dx++) put(wx + dx, wy + dy, 160, 210, 255, 0.75);
      }
    }
  }
  // antenna + small red beacon on some buildings
  if (rnd() < 0.45) {
    const ax = b.x + b.w / 2;
    for (let ay = top - 16; ay < top; ay++) put(ax, ay, 20, 24, 40, 1);
    disc(ax, top - 17, 2.2, 255, 60, 60, 0.95);
    disc(ax, top - 17, 5, 255, 60, 60, 0.25);
  }
}
// tall tower at x=842, w34, h215 + red beacon
{
  const tx = 842;
  const tw = 34;
  const th = 215;
  const top = CITY_BASE - th;
  for (let y = top; y < CITY_BASE; y++)
    for (let x = tx; x < tx + tw; x++) put(x, y, 12, 16, 34, 1);
  for (let wy = top + 12; wy < CITY_BASE - 10; wy += 15) {
    for (const wx of [tx + 6, tx + 20]) {
      if (rnd() < 0.5) {
        for (let dy = 0; dy < 6; dy++)
          for (let dx = 0; dx < 4; dx++) put(wx + dx, wy + dy, 255, 210, 125, 0.9);
      }
    }
  }
  for (let ay = top - 22; ay < top; ay++) put(tx + tw / 2, ay, 20, 24, 40, 1);
  disc(tx + tw / 2, top - 23, 2.6, 255, 60, 60, 1);
  disc(tx + tw / 2, top - 23, 6, 255, 60, 60, 0.3);
}

// ---- 3. jellyfish (hero): centre (512,330), rx 305, ry 245 ----
const JCX = 512;
const JCY = 330;
const JRX = 305;
const JRY = 245;
const rimY = (x: number) => 392 + 13 * Math.sin(x * 0.02 + 1.3) + 6 * Math.sin(x * 0.043 + 4.1);

// halo glow behind the bell: big soft cyan / violet / magenta blobs
for (let g = 0; g < 3; g++) {
  const gc: RGB = [[110, 243, 255], [178, 140, 255], [255, 110, 199]][g] as RGB;
  const gx = JCX + (g - 1) * 90;
  const gy = JCY - 10 + (g - 1) * 30;
  for (let r = 340; r > 0; r -= 8) {
    disc(gx, gy, r, gc[0], gc[1], gc[2], 0.012);
  }
}

// bell, drawn per-pixel inside the ellipse, cut by the wavy rim
const BELL_CORE: RGB = [235, 255, 255];
const BELL_MID: RGB = [110, 243, 255];
const BELL_EDGE: RGB = [178, 140, 255];
const HOT: RGB = [255, 110, 199];
for (let y = JCY - JRY; y <= JCY + JRY; y++) {
  const rim = rimY(0); // placeholder, per-x below
  void rim;
  for (let x = JCX - JRX; x <= JCX + JRX; x++) {
    const nx = (x - JCX) / JRX;
    const ny = (y - JCY) / JRY;
    const er = nx * nx + ny * ny;
    if (er > 1) continue;
    if (y > rimY(x)) continue;
    // radial gradient from the bright point (512,250)
    const d = Math.hypot(x - 512, y - 250) / 340;
    const t = Math.min(1, Math.max(0, d));
    let c: RGB = t < 0.35 ? mix(BELL_CORE, BELL_MID, t / 0.35) : mix(BELL_MID, BELL_EDGE, (t - 0.35) / 0.65);
    // smooth radial ribs: 14 ribs, soft white sheen, ~0.28 * (1 - t)
    const theta = Math.atan2(y - JCY, x - JCX);
    const rib = 0.5 + 0.5 * Math.cos(14 * theta);
    const coreDamp = 0.35 + 0.65 * Math.min(1, Math.max(0, (t - 0.05) / 0.3));
    const sheen = 0.22 * (1 - t) * rib * rib * coreDamp;
    c = [lerp(c[0], 255, sheen), lerp(c[1], 255, sheen), lerp(c[2], 255, sheen)];
    // hot magenta edge near the ellipse boundary
    const rr = Math.sqrt(er);
    if (rr > 0.92) {
      const s = (rr - 0.92) / 0.08;
      c = mix(c, HOT, Math.min(1, s * 0.85));
    }
    // bright arc along the top of the bell
    if (er > 0.86 && ny < -0.3) {
      const s = (er - 0.86) / 0.14;
      c = [lerp(c[0], 255, s * 0.5), lerp(c[1], 255, s * 0.5), lerp(c[2], 255, s * 0.5)];
    }
    // lower part of the bell fades gently (alpha down to ~0.45)
    let alpha = 1;
    const bottom = rimY(x);
    if (y > bottom - 42) alpha = 0.45 + 0.55 * (1 - (y - (bottom - 42)) / 42);
    put(x, y, c[0], c[1], c[2], alpha);
  }
}

// ---- tentacles: 14, rooted across 88% of the bell width on rimY ----
type Tent = { rootX: number; len: number; amp: number; freq: number; phase: number; pts: [number, number][] };
const tents: Tent[] = [];
for (let i = 0; i < 14; i++) {
  const frac = i / 13 - 0.5; // -0.5..0.5
  const rootX = JCX + frac * 2 * JRX * 0.88;
  const len = 250 + (1 - Math.abs(frac) * 2) * 160 + rnd() * 40;
  const amp = 24 + rnd() * 22;
  const freq = 1.4 + rnd() * 1.1;
  const phase = rnd() * Math.PI * 2;
  const pts: [number, number][] = [];
  const baseY = rimY(rootX);
  for (let s = 0; s <= 56; s++) {
    const tt = s / 56;
    const sway = Math.sin(tt * freq * Math.PI * 2 + phase) * amp * tt;
    pts.push([rootX + sway + frac * 26 * tt, baseY + tt * len]);
  }
  tents.push({ rootX, len, amp, freq, phase, pts });
}
const TENT_A: RGB = [110, 243, 255];
const TENT_B: RGB = [178, 140, 255];
const TENT_C: RGB = [255, 110, 199];
function tentColor(t: number): RGB {
  return t < 0.5 ? mix(TENT_A, TENT_B, t / 0.5) : mix(TENT_B, TENT_C, (t - 0.5) / 0.5);
}
// 3 passes: wide faint, medium, bright core; width tapers 7.5 -> ~2
const passes: { w0: number; a: number }[] = [
  { w0: 7.5, a: 0.1 },
  { w0: 4.5, a: 0.22 },
  { w0: 2.2, a: 0.85 },
];
for (const p of passes) {
  for (const tn of tents) {
    for (let s = 0; s < tn.pts.length - 1; s++) {
      const [x0, y0] = tn.pts[s];
      const [x1, y1] = tn.pts[s + 1];
      const segLen = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(segLen / 1.1));
      for (let k = 0; k <= steps; k++) {
        const tt = (s + k / steps) / (tn.pts.length - 1);
        const c = tentColor(tt);
        const w = Math.max(1.2, p.w0 * (1 - tt * 0.72));
        disc(x0 + ((x1 - x0) * k) / steps, y0 + ((y1 - y0) * k) / steps, w / 2 + 0.4, c[0], c[1], c[2], p.a);
      }
    }
  }
}
// glowing beads on tentacles 2, 5, 9, 12 at t = 0.35 / 0.62 / 0.88
for (const idx of [2, 5, 9, 12]) {
  const tn = tents[idx];
  for (const tt of [0.35, 0.62, 0.88]) {
    const si = Math.round(tt * (tn.pts.length - 1));
    const [px, py] = tn.pts[si];
    disc(px, py, 5, 255, 220, 255, 0.3);
    disc(px, py, 2.4, 255, 255, 255, 0.95);
  }
}

// ---- two soft light shafts from below the bell down to the city (y to 850) ----
for (const sx of [420, 604]) {
  for (let y = 400; y <= 850; y++) {
    const fade = 1 - (y - 400) / 450;
    const half = 26 + (y - 400) * 0.09;
    for (let x = Math.floor(sx - half); x <= Math.ceil(sx + half); x++) {
      const edge = 1 - Math.abs(x - sx) / half;
      put(x, y, 180, 240, 255, 0.05 * fade * edge * edge);
    }
  }
}

// ---- 4. small hot-air balloon at (782,648): FILLED ellipse, stripes, basket, ribbon ----
{
  const bx0 = 782;
  const by0 = 648;
  const rx = 30;
  const ry = 34;
  // filled ellipse, vertical 12px stripes alternating coral / cream
  for (let y = by0 - ry; y <= by0 + ry; y++) {
    for (let x = bx0 - rx; x <= bx0 + rx; x++) {
      const nx = (x - bx0) / rx;
      const ny = (y - by0) / ry;
      if (nx * nx + ny * ny > 1) continue;
      const stripe = Math.floor((x - (bx0 - rx)) / 12) % 2 === 0;
      const c: RGB = stripe ? [255, 122, 92] : [255, 236, 200];
      put(x, y, c[0], c[1], c[2], 1);
    }
  }
  // white highlight
  disc(bx0 - 11, by0 - 14, 7, 255, 255, 255, 0.55);
  disc(bx0 - 11, by0 - 14, 3.5, 255, 255, 255, 0.7);
  // 2 ropes to a brown basket 18x13
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    put(bx0 - 12 + 24 * t * 0.55, by0 + 34 + 12 * t, 120, 80, 50, 1);
    put(bx0 + 12 - 24 * t * 0.55, by0 + 34 + 12 * t, 120, 80, 50, 1);
  }
  for (let y = by0 + 46; y < by0 + 59; y++)
    for (let x = bx0 - 9; x < bx0 + 9; x++) put(x, y, 139, 94, 52, 1);
  // pink ribbon waving gently (sine curve) to the left
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    const rxp = bx0 - 28 - t * 34;
    const ryp = by0 + 10 + Math.sin(t * 9) * 6 * (0.4 + t);
    disc(rxp, ryp, 2.2, 255, 130, 180, 0.9);
  }
}

// ---- 5. text "LOOK UP." at (40,792), scale 3, 5x7 bitmap font ----
const GLYPHS: Record<string, string[]> = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "00000", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
{
  const text = "LOOK UP.";
  const scale = 3;
  let cx = 40;
  const cy = 792;
  for (const ch of text) {
    const g = GLYPHS[ch] ?? GLYPHS[" "];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] === "1") {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++)
              put(cx + col * scale + dx, cy + row * scale + dy, 255, 233, 176, 0.92);
        }
      }
    }
    cx += 6 * scale;
  }
}

// ---- 6. vignette: darken corners slightly (radial, max ~0.22 beyond 0.62*720px) ----
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - 512, y - 512);
    const inner = 0.62 * 720;
    if (d > inner) {
      const s = Math.min(1, (d - inner) / (724 - inner));
      const a = 0.22 * s * s;
      const i = (y * W + x) * 3;
      buf[i] = clamp255(buf[i] * (1 - a));
      buf[i + 1] = clamp255(buf[i + 1] * (1 - a));
      buf[i + 2] = clamp255(buf[i + 2] * (1 - a));
    }
  }
}

// ---- PNG encoder (own): signature, IHDR, IDAT (zlib deflate level 9), IEND ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
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
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function encodePNG(): Uint8Array {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

// ---- main ----
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const png = encodePNG();
writeFileSync(join(outDir, "entry.png"), png);
console.log(`wrote ${join(outDir, "entry.png")} (${png.length} bytes, ${W}x${H})`);
