// Generates PWA PNG icons (192 + 512) with no image dependencies, by writing PNG bytes
// directly. The artwork mirrors public/favicon.svg: a rounded gradient tile with a bold
// white "U" and an amber "+".
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- tiny PNG encoder ---
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// --- artwork ---
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

function roundedRectCoverage(x, y, size, inset, radius) {
  // Signed-distance-ish coverage for a rounded square, supersampled by the caller.
  const lo = inset;
  const hi = size - inset;
  const cx = Math.min(Math.max(x, lo + radius), hi - radius);
  const cy = Math.min(Math.max(y, lo + radius), hi - radius);
  const d = Math.hypot(x - cx, y - cy) - radius;
  const inside = x >= lo && x <= hi && y >= lo && y <= hi && d <= 0;
  return inside ? 1 : 0;
}

function uCoverage(x, y, s) {
  const cx = s * 0.5;
  const R = s * 0.274;
  const t = s * 0.115;
  const top = s * 0.254;
  const yb = s * 0.645;
  const inLeft = x >= cx - R && x <= cx - R + t && y >= top && y <= yb;
  const inRight = x >= cx + R - t && x <= cx + R && y >= top && y <= yb;
  const dx = x - cx;
  const dy = y - yb;
  const inBottom = dx * dx + dy * dy <= R * R && dy >= 0;
  return inLeft || inRight || inBottom ? 1 : 0;
}

function plusCoverage(x, y, s) {
  const cx = s * 0.5;
  const cy = s * 0.4;
  const arm = s * 0.105;
  const th = s * 0.037;
  const inV = Math.abs(x - cx) <= th && Math.abs(y - cy) <= arm;
  const inH = Math.abs(y - cy) <= th && Math.abs(x - cx) <= arm;
  return inV || inH ? 1 : 0;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const SS = 3; // supersampling factor
  const c1 = [0x63, 0x66, 0xf1];
  const c2 = [0x8b, 0x5c, 0xf6];
  const amber = [0xfb, 0xbf, 0x24];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let u = 0;
      let plus = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          bg += roundedRectCoverage(x, y, size, size * 0.039, size * 0.219);
          u += uCoverage(x, y, size);
          plus += plusCoverage(x, y, size);
        }
      }
      const n = SS * SS;
      bg /= n;
      u /= n;
      plus /= n;
      const tGrad = clamp01(py / size);
      const r0 = lerp(c1[0], c2[0], tGrad);
      const g0 = lerp(c1[1], c2[1], tGrad);
      const b0 = lerp(c1[2], c2[2], tGrad);
      // Composite: white U over gradient, then amber plus over the U.
      let r = lerp(0, r0, bg);
      let g = lerp(0, g0, bg);
      let b = 0 + b0 * bg;
      let a = bg;
      r = lerp(r, 255, u);
      g = lerp(g, 255, u);
      b = lerp(b, 255, u);
      r = lerp(r, amber[0], plus);
      g = lerp(g, amber[1], plus);
      b = lerp(b, amber[2], plus);
      const i = (py * size + px) * 4;
      buf[i] = Math.round(r);
      buf[i + 1] = Math.round(g);
      buf[i + 2] = Math.round(b);
      buf[i + 3] = Math.round(a * 255);
    }
  }
  return encodePng(size, size, buf);
}

const outDir = resolve(__dirname, '../public/icons');
mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  const png = render(size);
  writeFileSync(resolve(outDir, `icon-${size}.png`), png);
  console.log(`wrote icons/icon-${size}.png (${png.length} bytes)`);
}

const appleTouchPng = render(180);
writeFileSync(resolve(outDir, 'apple-touch-icon.png'), appleTouchPng);
console.log(`wrote icons/apple-touch-icon.png (${appleTouchPng.length} bytes)`);

