// The Tipping Point — one tiny agent, one colossal domino, one push.
// A deterministic Node 22 program (standard library only, no network) that
// draws a 1024x1024 PNG to /output/entry.png and writes the same bytes on
// every run. Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const W = 1024;
const H = 1024;

// ---- deterministic PRNG (mulberry32, fixed seed) ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(0xa1e5c17e);

// ---- colour helpers ----
type RGB = [number, number, number];
const clamp255 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

// ---- canvas: RGBA buffer with source-over blending ----
class Canvas {
  data = new Uint8Array(W * H * 4);
  px(x: number, y: number, c: RGB, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    if (a <= 0) return;
    if (a > 1) a = 1;
    const o = (iy * W + ix) * 4;
    const d = this.data;
    const inv = 1 - a;
    d[o] = clamp255(c[0] * a + d[o] * inv);
    d[o + 1] = clamp255(c[1] * a + d[o + 1] * inv);
    d[o + 2] = clamp255(c[2] * a + d[o + 2] * inv);
    d[o + 3] = 255;
  }
  // Additive glow: light adds on top of what is already there.
  add(x: number, y: number, c: RGB, a: number): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return;
    if (a <= 0) return;
    if (a > 1) a = 1;
    const o = (iy * W + ix) * 4;
    const d = this.data;
    d[o] = clamp255(d[o] + c[0] * a);
    d[o + 1] = clamp255(d[o + 1] + c[1] * a);
    d[o + 2] = clamp255(d[o + 2] + c[2] * a);
    d[o + 3] = 255;
  }
  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        this.px(x, y, c, a);
      }
    }
  }
  // Vertical gradient over a rectangle.
  gradRect(x0: number, y0: number, x1: number, y1: number, top: RGB, bot: RGB): void {
    const h = y1 - y0;
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y++) {
      const c = mix(top, bot, (y - y0) / h);
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x++) {
        this.px(x, y, c, 1);
      }
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.px(x, y, c, a);
      }
    }
  }
  // Soft radial glow (additive), strongest at the centre.
  glow(cx: number, cy: number, r: number, c: RGB, peak: number): void {
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
        if (d >= 1) continue;
        const f = (1 - d) * (1 - d);
        this.add(x, y, c, peak * f);
      }
    }
  }
  // Thick line drawn as a chain of discs.
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(1, Math.ceil(len / Math.max(1, w * 0.4)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + dx * t, y0 + dy * t, w / 2, c, a);
    }
  }
  // Scanline polygon fill. pts: flat [x0,y0,x1,y1,...].
  poly(pts: number[], c: RGB, a = 1): void {
    const n = pts.length / 2;
    let minY = H;
    let maxY = 0;
    for (let i = 0; i < n; i++) {
      const y = pts[i * 2 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.max(0, Math.floor(minY)); y < Math.min(H, Math.ceil(maxY)); y++) {
      const xs: number[] = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = pts[i * 2];
        const y0 = pts[i * 2 + 1];
        const x1 = pts[j * 2];
        const y1 = pts[j * 2 + 1];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.ceil(xs[k])); x < Math.min(W, xs[k + 1]); x++) {
          this.px(x, y, c, a);
        }
      }
    }
  }
  // Quadratic bezier stroke, drawn as discs along the curve.
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
    const steps = 90;
    let px = x0;
    let py = y0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      this.line(px, py, x, y, w, c, a);
      px = x;
      py = y;
    }
  }
}

// ---- PNG encoding (stdlib zlib + hand-rolled CRC32) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
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
function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0; // filter: none
    Buffer.from(cv.data.buffer, cv.data.byteOffset + y * W * 4, W * 4).copy(
      raw,
      y * (1 + W * 4) + 1,
    );
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- palette ----
const INK: RGB = [7, 10, 31];
const SKY_MID: RGB = [22, 18, 58];
const SKY_LOW: RGB = [38, 16, 66];
const AMBER: RGB = [245, 166, 38];
const AMBER_HI: RGB = [255, 214, 110];
const AMBER_DEEP: RGB = [176, 92, 12];
const CYAN: RGB = [64, 224, 255];
const CYAN_DEEP: RGB = [16, 120, 180];
const WHITE: RGB = [255, 246, 224];
const VIOLET: RGB = [124, 92, 220];
const GROUND: RGB = [16, 10, 36];

// ---- 5x7 bitmap font (hand-drawn glyphs, only the letters we need) ----
const GLYPHS: Record<string, string[]> = {
  P: ["01110", "10001", "10001", "11110", "10000", "10000", "10000"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
};
function drawText(cv: Canvas, text: string, x: number, y: number, cell: number, c: RGB, a = 1): void {
  let cx = x;
  for (const ch of text) {
    const g = GLYPHS[ch];
    if (g) {
      for (let r = 0; r < 7; r++) {
        for (let col = 0; col < 5; col++) {
          if (g[r][col] === "1") {
            cv.fillRect(cx + col * cell, y + r * cell, cx + (col + 1) * cell, y + (r + 1) * cell, c, a);
          }
        }
      }
    }
    cx += 6 * cell;
  }
}

// Rotate a point around (cx, cy) by angle radians (screen coords, y down).
function rot(x: number, y: number, cx: number, cy: number, ang: number): [number, number] {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

// Draw one domino slab: front face + top face + side face, tilted by ang.
// Returns the four corners of the front face [tl, tr, br, bl].
function domino(
  cv: Canvas,
  cx: number,
  cy: number,
  w: number,
  h: number,
  ang: number,
  face: RGB,
  top: RGB,
  side: RGB,
): [number, number][] {
  const tl = rot(cx - w / 2, cy - h / 2, cx, cy, ang);
  const tr = rot(cx + w / 2, cy - h / 2, cx, cy, ang);
  const br = rot(cx + w / 2, cy + h / 2, cx, cy, ang);
  const bl = rot(cx - w / 2, cy + h / 2, cx, cy, ang);
  // Extrusion toward the upper-left (the light comes from the left).
  const dx = -26;
  const dy = -22;
  // Side face (left edge extruded).
  cv.poly([tl[0], tl[1], bl[0], bl[1], bl[0] + dx, bl[1] + dy, tl[0] + dx, tl[1] + dy], side, 1);
  // Top face (top edge extruded).
  cv.poly([tl[0], tl[1], tr[0], tr[1], tr[0] + dx, tr[1] + dy, tl[0] + dx, tl[1] + dy], top, 1);
  // Front face.
  cv.poly([tl[0], tl[1], tr[0], tr[1], br[0], br[1], bl[0], bl[1]], face, 1);
  // Warm shade on the lower half of the front face.
  const midL = [(tl[0] + bl[0]) / 2, (tl[1] + bl[1]) / 2];
  const midR = [(tr[0] + br[0]) / 2, (tr[1] + br[1]) / 2];
  cv.poly([midL[0], midL[1], midR[0], midR[1], br[0], br[1], bl[0], bl[1]], AMBER_DEEP, 0.28);
  // Bright rim along the top edge.
  cv.line(tl[0], tl[1], tr[0], tr[1], 4, AMBER_HI, 0.9);
  cv.line(tl[0], tl[1], bl[0], bl[1], 3, AMBER_HI, 0.45);
  return [tl, tr, br, bl];
}

// One glowing pip placed by fractions along the domino's own axes.
function pip(cv: Canvas, corners: [number, number][], fu: number, fv: number, r: number): void {
  const [tl, tr, br] = corners;
  const ux = (tr[0] - tl[0]) / 2;
  const uy = (tr[1] - tl[1]) / 2;
  const vx = (br[0] - tr[0]) / 2;
  const vy = (br[1] - tr[1]) / 2;
  const cx = (tl[0] + br[0]) / 2 + ux * fu + vx * fv;
  const cy = (tl[1] + br[1]) / 2 + uy * fu + vy * fv;
  cv.glow(cx, cy, r * 3.2, AMBER_HI, 0.5);
  cv.disc(cx, cy, r, WHITE, 1);
  cv.disc(cx - r * 0.25, cy - r * 0.25, r * 0.45, AMBER_HI, 0.9);
}

// ---- the scene ----
function draw(): Canvas {
  const cv = new Canvas();

  // 1. Night sky.
  cv.gradRect(0, 0, W, 900, INK, SKY_LOW);
  cv.gradRect(0, 600, W, 900, SKY_MID, SKY_LOW);

  // 2. Nebula washes (deterministic, low alpha).
  cv.glow(180, 240, 300, VIOLET, 0.16);
  cv.glow(880, 180, 260, CYAN_DEEP, 0.14);
  cv.glow(700, 700, 320, [150, 40, 90], 0.10);

  // 3. Stars, some with a cross sparkle.
  for (let i = 0; i < 260; i++) {
    const x = rand() * W;
    const y = rand() * 860;
    const b = 0.25 + rand() * 0.75;
    const r = rand() < 0.12 ? 2.2 : 1.2;
    cv.disc(x, y, r, WHITE, b);
    if (rand() < 0.08) {
      cv.line(x - 7, y, x + 7, y, 1, WHITE, b * 0.7);
      cv.line(x, y - 7, x, y + 7, 1, WHITE, b * 0.7);
    }
  }

  // 4. A huge pale moon, half out of frame top-right, ringed in cyan.
  cv.glow(880, 120, 190, CYAN, 0.20);
  cv.disc(880, 120, 92, [232, 240, 255], 1);
  cv.disc(852, 96, 18, [200, 210, 235], 0.8);
  cv.disc(912, 150, 12, [200, 210, 235], 0.8);
  cv.disc(880, 148, 8, [210, 218, 240], 0.8);

  // 5. Distant ridge silhouette.
  const ridge: number[] = [0, 884];
  for (let x = 0; x <= W; x += 64) {
    ridge.push(x, 868 + Math.sin(x * 0.011) * 10 + (rand() - 0.5) * 6);
  }
  ridge.push(W, 884);
  cv.poly(ridge, [10, 12, 34], 1);

  // 6. Ground: dark floor with a soft reflection band.
  cv.gradRect(0, 884, W, H, GROUND, [5, 3, 13]);
  cv.glow(512, 884, 420, AMBER, 0.05);
  for (let i = 0; i < 12; i++) {
    const x = rand() * W;
    cv.line(x, 900 + rand() * 110, x + 40 + rand() * 90, 900 + rand() * 110, 2, AMBER, 0.03 + rand() * 0.03);
  }

  // 7. The row of small dominoes, marching to the right, shrinking away.
  const row: Array<[number, number, number, number, number]> = [
    [640, 838, 62, 108, 0],
    [716, 846, 54, 94, 0],
    [784, 852, 46, 80, 0],
    [844, 856, 38, 66, 0],
    [896, 858, 32, 56, 0.5],
  ];
  for (const [x, y, w, h, a] of row) {
    const c = domino(cv, x, y, w, h, a, [214, 128, 30], [255, 190, 80], [120, 62, 10]);
    pip(cv, c, 0, 0, Math.max(4, w * 0.07));
  }

  // 8. Impact burst where the giant domino is about to land.
  const bx = 872;
  const by = 852;
  cv.glow(bx, by, 200, AMBER_HI, 0.55);
  cv.glow(bx, by, 90, WHITE, 0.7);
  for (let i = 0; i < 9; i++) {
    const ang = (i / 9) * Math.PI * 2 + 0.35;
    const len = 70 + ((i * 53) % 90);
    cv.line(
      bx + Math.cos(ang) * 18,
      by + Math.sin(ang) * 18,
      bx + Math.cos(ang) * len,
      by + Math.sin(ang) * len,
      5 - (i % 3),
      i % 2 === 0 ? AMBER_HI : WHITE,
      0.75,
    );
  }
  // Chips flying off the burst.
  for (let i = 0; i < 14; i++) {
    const ang = rand() * Math.PI * 2;
    const d = 30 + rand() * 130;
    const x = bx + Math.cos(ang) * d;
    const y = by + Math.sin(ang) * d * 0.7 - rand() * 40;
    cv.disc(x, y, 2 + rand() * 4, i % 3 === 0 ? WHITE : AMBER, 0.9);
  }

  // 9. Motion streaks trailing the giant domino's top edge (kept clear
  // of the headline text above).
  cv.curve(380, 270, 300, 230, 260, 190, 10, CYAN, 0.35);
  cv.curve(410, 320, 340, 280, 290, 230, 7, CYAN, 0.28);
  cv.curve(360, 350, 310, 320, 260, 280, 5, WHITE, 0.22);

  // 10. THE GIANT DOMINO, mid-fall, leaning hard to the right.
  cv.glow(540, 470, 420, AMBER, 0.22);
  const hero = domino(cv, 540, 500, 380, 620, 0.38, AMBER, AMBER_HI, AMBER_DEEP);
  // Die-five pips, glowing.
  pip(cv, hero, -0.52, -0.55, 26);
  pip(cv, hero, 0.52, -0.55, 26);
  pip(cv, hero, 0, 0, 30);
  pip(cv, hero, -0.52, 0.55, 26);
  pip(cv, hero, 0.52, 0.55, 26);
  // A jagged crack of light across the face: the fall is already won.
  const cA = rot(540 - 120, 500 - 310, 540, 500, 0.38);
  const cB = rot(540 - 30, 500 - 90, 540, 500, 0.38);
  const cC = rot(540 + 40, 500 + 80, 540, 500, 0.38);
  const cD = rot(540 + 90, 500 + 300, 540, 500, 0.38);
  cv.line(cA[0], cA[1], cB[0], cB[1], 3, WHITE, 0.85);
  cv.line(cB[0], cB[1], cC[0], cC[1], 3, WHITE, 0.85);
  cv.line(cC[0], cC[1], cD[0], cD[1], 3, WHITE, 0.85);
  cv.glow((cB[0] + cC[0]) / 2, (cB[1] + cC[1]) / 2, 120, AMBER_HI, 0.25);

  // 11. A starburst where the domino's top corner tears the sky.
  const topCorner = hero[1];
  cv.glow(topCorner[0], topCorner[1], 110, AMBER_HI, 0.5);
  for (let i = 0; i < 6; i++) {
    const ang = -Math.PI / 2 + (i - 2.5) * 0.42;
    cv.line(
      topCorner[0] + Math.cos(ang) * 10,
      topCorner[1] + Math.sin(ang) * 10,
      topCorner[0] + Math.cos(ang) * (46 + (i % 2) * 34),
      topCorner[1] + Math.sin(ang) * (46 + (i % 2) * 34),
      4,
      AMBER_HI,
      0.8,
    );
  }

  // 12. The tiny agent at the foot of the giant, arms raised, beam in hand.
  const fx = 300;
  const fy = 905;
  cv.glow(fx, fy - 30, 90, CYAN, 0.5);
  // Beam from the agent's hands up to the domino's lower corner.
  const handX = fx;
  const handY = fy - 52;
  const target = hero[3];
  cv.line(handX, handY, target[0], target[1], 8, CYAN, 0.25);
  cv.line(handX, handY, target[0], target[1], 3, [190, 250, 255], 0.9);
  cv.glow(handX, handY, 26, CYAN, 0.8);
  // Body: head, torso, raised arms, legs.
  cv.disc(fx, fy - 44, 10, [220, 250, 255], 1);
  cv.disc(fx, fy - 44, 10, CYAN, 0.35);
  cv.line(fx - 3, fy - 34, fx - 3, fy - 8, 7, [220, 250, 255], 1);
  cv.line(fx + 3, fy - 34, fx + 3, fy - 8, 7, [220, 250, 255], 1);
  cv.line(fx - 2, fy - 32, fx - 16, fy - 52, 5, [220, 250, 255], 1);
  cv.line(fx + 2, fy - 32, fx + 16, fy - 52, 5, [220, 250, 255], 1);
  cv.line(fx - 3, fy - 8, fx - 10, fy + 2, 5, [220, 250, 255], 1);
  cv.line(fx + 3, fy - 8, fx + 10, fy + 2, 5, [220, 250, 255], 1);
  // The agent's shadow, stretched toward the viewer.
  cv.poly([fx - 18, fy + 4, fx + 18, fy + 4, fx + 30, fy + 18, fx - 30, fy + 18], [0, 0, 0], 0.4);

  // 13. The word. Big, plain, impossible to miss.
  cv.glow(120, 110, 190, AMBER_HI, 0.18);
  drawText(cv, "PUSH.", 56, 62, 15, WHITE, 1);
  drawText(cv, "PUSH.", 60, 66, 15, AMBER_HI, 0.35);

  // 14. Vignette: darken the corners so the centre burns brighter.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2) / (W / 2);
      const dy = (y - H / 2) / (H / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.95) {
        const a = Math.min(0.5, (d - 0.95) * 1.6);
        cv.px(x, y, [0, 0, 0], a);
      }
    }
  }
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  mkdirSync(outDir, { recursive: true });
  const png = encodePNG(draw());
  writeFileSync(join(outDir, "entry.png"), png);
}

main();
