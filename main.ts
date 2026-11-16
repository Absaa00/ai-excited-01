// ai-excited-01 — round 4 rebuild
// A giant glowing jellyfish drifts over a sleeping city.
// Procedural, deterministic, no network, no dependencies.
// Run: node main.ts  -> writes /output/entry.png (1024x1024 PNG)
import * as fs from "node:fs";
import * as zlib from "node:zlib";
import * as path from "node:path";

const W: number = 1024;
const H: number = 1024;
const OUT: string = "/output/entry.png";

// ---------- deterministic PRNG (mulberry32, fixed seed) ----------
function mulberry32(seed: number): () => number {
  let a: number = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t: number = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand: () => number = mulberry32(20261117);

// ---------- pixel buffer ----------
const img: Uint8Array = new Uint8Array(W * H * 3);
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function setPx(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i: number = (y * W + x) * 3;
  img[i] = clamp255(r); img[i + 1] = clamp255(g); img[i + 2] = clamp255(b);
}
function addPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  const i: number = (y * W + x) * 3;
  img[i] = clamp255(img[i] + r * a);
  img[i + 1] = clamp255(img[i + 1] + g * a);
  img[i + 2] = clamp255(img[i + 2] + b * a);
}
function blendPx(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || x >= W || y < 0 || y >= H || a <= 0) return;
  if (a >= 1) { setPx(x, y, r, g, b); return; }
  const i: number = (y * W + x) * 3;
  img[i] = clamp255(img[i] * (1 - a) + r * a);
  img[i + 1] = clamp255(img[i + 1] * (1 - a) + g * a);
  img[i + 2] = clamp255(img[i + 2] * (1 - a) + b * a);
}
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function mix3(c1: number[], c2: number[], t: number): number[] {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

// ---------- 1. night sky gradient ----------
const skyTop: number[] = [4, 7, 22];
const skyMid: number[] = [13, 16, 52];
const skyLow: number[] = [46, 22, 84];
for (let y = 0; y < H; y++) {
  const t: number = y / (H - 1);
  const c: number[] = t < 0.55 ? mix3(skyTop, skyMid, t / 0.55) : mix3(skyMid, skyLow, (t - 0.55) / 0.45);
  for (let x = 0; x < W; x++) setPx(x, y, c[0], c[1], c[2]);
}

// ---------- 2. stars ----------
for (let s = 0; s < 260; s++) {
  const x: number = Math.floor(rand() * W);
  const y: number = Math.floor(rand() * 620);
  const b: number = 120 + rand() * 135;
  const r: number = Math.floor(rand() * 2) + 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d: number = Math.sqrt(dx * dx + dy * dy);
    if (d <= r) addPx(x + dx, y + dy, b, b, b * 0.95, 0.9 * (1 - d / (r + 1)));
  }
  if (rand() < 0.12) { // sparkle cross
    for (let k = -6; k <= 6; k++) { addPx(x + k, y, b, b, b, 0.35); addPx(x, y + k, b, b, b, 0.35); }
  }
}

// ---------- 3. moon (upper right) ----------
const MX: number = 838; const MY: number = 138; const MR: number = 52;
for (let y = MY - 110; y <= MY + 110; y++) for (let x = MX - 110; x <= MX + 110; x++) {
  const d: number = Math.sqrt((x - MX) * (x - MX) + (y - MY) * (y - MY));
  if (d < MR) {
    const shade: number = 235 - d * 0.35;
    setPx(x, y, shade, shade * 0.96, shade * 0.82);
  } else if (d < 110) {
    addPx(x, y, 190, 200, 235, 0.35 * (1 - d / 110));
  }
}
// moon craters
const craters: number[][] = [[818, 122, 9], [852, 152, 12], [838, 162, 7], [822, 152, 6]];
for (const cr of craters) {
  for (let y = cr[1] - cr[2]; y <= cr[1] + cr[2]; y++) for (let x = cr[0] - cr[2]; x <= cr[0] + cr[2]; x++) {
    const d: number = Math.sqrt((x - cr[0]) * (x - cr[0]) + (y - cr[1]) * (y - cr[1]));
    if (d < cr[2]) blendPx(x, y, 205, 205, 190, 0.5);
  }
}

// ---------- 4. distant city glow on horizon ----------
for (let x = 0; x < W; x++) {
  const glow: number = 26 + 14 * Math.sin(x * 0.011) + 8 * Math.sin(x * 0.031 + 2);
  for (let y = 690; y < 760; y++) {
    const f: number = 1 - Math.abs(y - 725) / 35;
    if (f > 0) addPx(x, y, 120 * f * 0.4, 70 * f * 0.4, 160 * f * 0.4, glow / 60 * f);
  }
}

// ---------- 5. city silhouette (sleeping city, bottom) ----------
type Building = { x: number; w: number; top: number; shade: number };
const buildings: Building[] = [];
let bx: number = -10;
while (bx < W) {
  const w: number = 42 + Math.floor(rand() * 58);
  const top: number = 760 + Math.floor(rand() * 130);
  buildings.push({ x: bx, w, top, shade: 6 + rand() * 8 });
  bx += w + 2 + Math.floor(rand() * 10);
}
for (const b of buildings) {
  for (let y = b.top; y < H; y++) for (let x = b.x; x < b.x + b.w; x++) {
    setPx(x, y, b.shade, b.shade + 2, b.shade + 9);
  }
  // rooftop antenna on some
  if (rand() < 0.35) {
    const ax: number = b.x + Math.floor(b.w / 2);
    for (let y = b.top - 18; y < b.top; y++) setPx(ax, y, 20, 20, 30);
    setPx(ax, b.top - 19, 255, 90, 90);
  }
  // lit windows: sparse warm dots
  for (let wy = b.top + 14; wy < H - 12; wy += 22) {
    for (let wx = b.x + 10; wx < b.x + b.w - 10; wx += 18) {
      if (rand() < 0.16) {
        const warm: number = rand() < 0.75;
        const wr: number = warm ? 255 : 150; const wg: number = warm ? 190 : 210; const wb: number = warm ? 90 : 255;
        for (let dy = 0; dy < 9; dy++) for (let dx = 0; dx < 7; dx++) setPx(wx + dx, wy + dy, wr, wg, wb);
        addPx(wx + 3, wy + 4, wr, wg, wb, 0.25);
      }
    }
  }
}

// ---------- 6. hot-air balloons (coral / cream) ----------
function balloon(cx: number, cy: number, s: number, c1: number[], c2: number[]): void {
  const rx: number = 34 * s; const ry: number = 42 * s;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
    const dx: number = (x - cx) / rx; const dy: number = (y - cy) / ry;
    const d: number = dx * dx + dy * dy;
    if (d <= 1) {
      const stripe: number = Math.sin(dx * 9) > 0 ? 0 : 1;
      const c: number[] = stripe ? c1 : c2;
      const shade: number = 1 - 0.25 * Math.abs(dx);
      blendPx(x, y, c[0] * shade, c[1] * shade, c[2] * shade, 0.97);
    }
  }
  // basket + ropes
  const by: number = Math.floor(cy + ry + 16 * s);
  for (let y = by; y < by + 12 * s; y++) for (let x = Math.floor(cx - 9 * s); x <= cx + 9 * s; x++) setPx(x, y, 120, 82, 48);
  for (let k = -1; k <= 1; k++) {
    for (let t = 0; t <= 10; t++) {
      const x: number = Math.floor(cx + k * 9 * s + (k * -14 * s * t) / 10 + (k === 0 ? 0 : 0));
      const y: number = Math.floor(cy + ry * 0.85 + t * 1.6 * s);
      setPx(x, y, 220, 200, 170);
    }
  }
  addPx(Math.floor(cx), Math.floor(cy), 255, 255, 255, 0.0);
}
balloon(168, 268, 1.0, [255, 127, 110], [255, 240, 214]);
balloon(872, 330, 0.72, [255, 150, 120], [255, 244, 220]);
balloon(96, 470, 0.6, [255, 140, 115], [250, 235, 205]);

// ---------- 7. GIANT JELLYFISH ----------
const JX: number = 512; const JY: number = 372;
const JRX: number = 330; const JRY: number = 215;
// halo glow (drawn first, behind bell)
for (let y = JY - 330; y <= JY + 330; y++) for (let x = JX - 430; x <= JX + 430; x++) {
  const dx: number = (x - JX) / JRX; const dy: number = (y - JY) / JRY;
  const d: number = Math.sqrt(dx * dx + dy * dy);
  if (d > 0.9 && d < 1.55) {
    const f: number = Math.pow(1 - (d - 0.9) / 0.65, 2) * 0.55;
    addPx(x, y, 90, 180, 255, f * 0.5);
    addPx(x, y, 220, 80, 220, f * 0.35);
  }
}
// bell body: cyan top -> violet mid -> magenta rim
for (let y = JY - JRY; y <= JY + 90; y++) for (let x = JX - JRX; x <= JX + JRX; x++) {
  const dx: number = (x - JX) / JRX; const dy: number = (y - JY) / JRY;
  const d: number = Math.sqrt(dx * dx + dy * dy);
  if (d >= 1) continue;
  // wavy scalloped bottom edge
  const edge: number = 0.42 + 0.10 * Math.sin((x - JX) * 0.055) * Math.sin((x - JX) * 0.021 + 1.3);
  if (dy > edge && Math.abs(dx) > 0.15) continue;
  if (dy > 0.55 && Math.abs(dx) <= 0.15) continue;
  const t: number = (dy + 1) / 2; // 0 top -> 1 bottom
  let c: number[];
  if (t < 0.5) c = mix3([0, 235, 255], [150, 90, 255], t / 0.5);
  else c = mix3([150, 90, 255], [255, 60, 205], (t - 0.5) / 0.5);
  // bright core near top centre
  const core: number = Math.max(0, 1 - Math.sqrt(dx * dx * 2.2 + (dy + 0.55) * (dy + 0.55) * 2.0));
  c = [c[0] + 90 * core, c[1] + 60 * core, c[2] + 40 * core];
  // radial ribs
  const ang: number = Math.atan2(dy + 0.2, dx);
  const rib: number = 0.5 + 0.5 * Math.sin(ang * 14);
  c = [c[0] + 45 * rib * (1 - d), c[1] + 35 * rib * (1 - d), c[2] + 25 * rib * (1 - d)];
  // rim brightening
  const rim: number = Math.max(0, (d - 0.82) / 0.18);
  c = [c[0] + 70 * rim, c[1] + 40 * rim, c[2] + 60 * rim];
  const alpha: number = 0.96 - 0.25 * d;
  blendPx(x, y, c[0], c[1], c[2], alpha);
  // sparkle dots inside bell
  if (((x * 37 + y * 91) % 997) < 6 && d < 0.85) addPx(x, y, 255, 255, 255, 0.7);
}
// tentacles: long luminous trails down toward the city
type Tent = { base: number; amp: number; phase: number; len: number; thick: number; hue: number };
const tents: Tent[] = [];
for (let i = 0; i < 30; i++) {
  const frac: number = i / 29;
  tents.push({
    base: JX + (frac - 0.5) * 560,
    amp: 14 + rand() * 26,
    phase: rand() * 6.28,
    len: 260 + rand() * 260,
    thick: 2 + rand() * 3,
    hue: rand(),
  });
}
function tentColor(hue: number, t: number): number[] {
  if (hue < 0.33) return mix3([0, 230, 255], [150, 90, 255], t);
  if (hue < 0.66) return mix3([120, 160, 255], [255, 80, 210], t);
  return mix3([0, 240, 220], [255, 110, 190], t);
}
for (const tn of tents) {
  const startY: number = JY + 55 + Math.abs(tn.base - JX) * 0.12;
  // glow pass (wide, faint)
  for (let s = 0; s < tn.len; s += 2) {
    const y: number = Math.floor(startY + s);
    const x: number = Math.floor(tn.base + Math.sin(s * 0.018 + tn.phase) * tn.amp * (0.4 + s / tn.len));
    const fade: number = 1 - s / tn.len;
    const c: number[] = tentColor(tn.hue, s / tn.len);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dy * dy <= 16) addPx(x + dx, y + dy, c[0], c[1], c[2], 0.16 * fade);
    }
  }
  // core pass (thin, bright)
  for (let s = 0; s < tn.len; s += 1) {
    const y: number = Math.floor(startY + s);
    const x: number = Math.floor(tn.base + Math.sin(s * 0.018 + tn.phase) * tn.amp * (0.4 + s / tn.len));
    const fade: number = 1 - s / tn.len;
    const c: number[] = tentColor(tn.hue, s / tn.len);
    const th: number = Math.max(1, Math.floor(tn.thick * fade));
    for (let dy = -th; dy <= th; dy++) for (let dx = -th; dx <= th; dx++) {
      if (dx * dx + dy * dy <= th * th) blendPx(x + dx, y + dy, c[0], c[1], c[2], 0.9 * fade + 0.1);
    }
    // glowing bead at tip
    if (s === tn.len - 1) {
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        if (dx * dx + dy * dy <= 25) addPx(x + dx, y + dy, c[0], c[1], c[2], 0.8);
      }
    }
  }
}
// drifting glow particles around the jellyfish
for (let p = 0; p < 90; p++) {
  const x: number = Math.floor(JX + (rand() - 0.5) * 760);
  const y: number = Math.floor(JY + (rand() - 0.5) * 560);
  const c: number[] = tentColor(rand(), rand());
  addPx(x, y, c[0], c[1], c[2], 0.9);
  addPx(x + 1, y, c[0], c[1], c[2], 0.5);
}

// ---------- 8. text "LOOK UP." — 5x7 bitmap font, clean and readable ----------
const FONT: Record<string, string[]> = {
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};
function drawText(text: string, x0: number, y0: number, scale: number): void {
  // dark outline pass, then white core
  for (const pass of [0, 1]) {
    const col: number[] = pass === 0 ? [2, 4, 14] : [255, 255, 255];
    const pad: number = pass === 0 ? 2 : 0;
    let cx: number = x0;
    for (const ch of text) {
      const glyph: string[] = FONT[ch] || FONT[" "];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === "1") {
          for (let dy = -pad; dy < scale + pad; dy++) for (let dx = -pad; dx < scale + pad; dx++) {
            if (pass === 0 || (dx >= 0 && dx < scale && dy >= 0 && dy < scale)) {
              setPx(cx + c * scale + dx, y0 + r * scale + dy, col[0], col[1], col[2]);
            }
          }
        }
      }
      cx += 6 * scale;
    }
  }
  // cyan underline glow
  const totalW: number = text.length * 6 * scale - scale;
  for (let x = x0; x < x0 + totalW; x++) {
    addPx(x, y0 + 7 * scale + 10, 0, 220, 255, 0.7);
    addPx(x, y0 + 7 * scale + 11, 0, 220, 255, 0.7);
  }
}
const TEXT: string = "LOOK UP.";
const SCALE: number = 13;
const textW: number = TEXT.length * 6 * SCALE - SCALE;
drawText(TEXT, Math.floor((W - textW) / 2), 872, SCALE);

// ---------- PNG encoder (colour type 2, RGB, filter 0) ----------
function crc32(buf: Buffer): number {
  let table: number[] | null = (crc32 as unknown as { t?: number[] }).t || null;
  if (!table) {
    table = [];
    for (let n = 0; n < 256; n++) {
      let c: number = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    (crc32 as unknown as { t: number[] }).t = table;
  }
  let crc: number = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len: Buffer = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td: Buffer = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc: Buffer = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(): Buffer {
  const raw: Buffer = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    raw.set(img.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat: Buffer = zlib.deflateSync(raw, { level: 9 });
  const ihdr: Buffer = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig: Buffer = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePNG());
console.log("wrote " + OUT);
