import { useMemo } from 'react';

/**
 * Minimal, zero-dependency QR Code generator (Model 2, Byte mode, Error Correction Level L/M).
 * Generates an SVG path for crisp rendering at any resolution.
 */

// Galois Field 256 math for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x >= 128 ? 0x11d : 0);
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[LOG_TABLE[x]! + LOG_TABLE[y]!] ?? 0;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP_TABLE[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j] = (next[j] ?? 0) ^ gfMul(poly[j]!, root);
      next[j + 1] = (next[j + 1] ?? 0) ^ poly[j]!;
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data: Uint8Array, numEc: number): Uint8Array {
  const gen = rsGeneratorPoly(numEc);
  const remainder = new Uint8Array(numEc);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i]! ^ remainder[0]!;
    remainder.copyWithin(0, 1);
    remainder[numEc - 1] = 0;
    for (let j = 0; j < numEc; j++) {
      remainder[j] = (remainder[j] ?? 0) ^ gfMul(gen[j]!, factor);
    }
  }
  return remainder;
}

// Version table: [version, numTotalBytes, numEcBytes]
const VERSION_SPECS = [
  { version: 1, total: 26, ec: 7, size: 21 },
  { version: 2, total: 44, ec: 10, size: 25 },
  { version: 3, total: 70, ec: 15, size: 29 },
  { version: 4, total: 100, ec: 20, size: 33 },
  { version: 5, total: 134, ec: 26, size: 37 },
  { version: 6, total: 172, ec: 36, size: 41 },
];

function selectVersion(dataLen: number) {
  for (const v of VERSION_SPECS) {
    const capacity = v.total - v.ec - (v.version < 10 ? 2 : 3);
    if (dataLen <= capacity) return v;
  }
  return VERSION_SPECS[VERSION_SPECS.length - 1]!;
}

export function generateQrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const spec = selectVersion(bytes.length);
  const { total, ec, size, version } = spec;
  const dataCapacity = total - ec;

  // Encode byte mode bitstream
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode indicator
  pushBits(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) pushBits(b, 8);

  // Terminator
  const maxDataBits = dataCapacity * 8;
  const termLen = Math.min(4, maxDataBits - bits.length);
  pushBits(0, termLen);

  // Pad to byte
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxDataBits) {
    pushBits(padPatterns[padIdx % 2]!, 8);
    padIdx++;
  }

  // Convert bits to byte array
  const dataBytes = new Uint8Array(dataCapacity);
  for (let i = 0; i < dataCapacity; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | (bits[i * 8 + j] ?? 0);
    dataBytes[i] = b;
  }

  // Error correction
  const ecBytes = rsEncode(dataBytes, ec);
  const finalCodewords = new Uint8Array(total);
  finalCodewords.set(dataBytes, 0);
  finalCodewords.set(ecBytes, dataCapacity);

  // Initialize Matrix
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));

  // Function to place Finder Patterns
  const placeFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6) {
            matrix[nr]![nc] =
              dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
          } else {
            matrix[nr]![nc] = false; // separator
          }
        }
      }
    }
  };

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Alignment Pattern for Version >= 2
  if (version >= 2) {
    const alignPos = size - 7;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = alignPos + dr;
        const nc = alignPos + dc;
        if (matrix[nr]?.[nc] === null) {
          matrix[nr]![nc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6]![i] === null) matrix[6]![i] = i % 2 === 0;
    if (matrix[i]![6] === null) matrix[i]![6] = i % 2 === 0;
  }

  // Dark module
  matrix[4 * version + 9]![8] = true;

  // Reserve format areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8]![i] === null) matrix[8]![i] = false;
    if (matrix[i]![8] === null) matrix[i]![8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8]![i] === null) matrix[8]![i] = false;
    if (matrix[i]![8] === null) matrix[i]![8] = false;
  }

  // Place codewords with Mask 0 ((r + c) % 2 === 0)
  let bitIdx = 0;
  const allBits: number[] = [];
  for (const b of finalCodewords) {
    for (let k = 7; k >= 0; k--) allBits.push((b >> k) & 1);
  }

  let right = size - 1;
  let upward = true;
  while (right > 0) {
    if (right === 6) right--; // skip vertical timing line
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (let c = right; c >= right - 1; c--) {
        if (matrix[r]![c] === null) {
          let bit = bitIdx < allBits.length ? allBits[bitIdx]! : 0;
          bitIdx++;
          // Apply mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit ^= 1;
          matrix[r]![c] = bit === 1;
        }
      }
    }
    right -= 2;
    upward = !upward;
  }

  // Place Format Info (Level L, Mask 0: 0x77c4)
  const formatInfo = 0x77c4;
  for (let i = 0; i < 15; i++) {
    const bit = ((formatInfo >> i) & 1) === 1;
    // Around top-left
    if (i < 6) matrix[8]![i] = bit;
    else if (i === 6) matrix[8]![7] = bit;
    else if (i === 7) matrix[8]![8] = bit;
    else if (i === 8) matrix[7]![8] = bit;
    else matrix[14 - i]![8] = bit;

    // Around bottom-left / top-right
    if (i < 8) matrix[size - 1 - i]![8] = bit;
    else matrix[8]![size - 15 + i] = bit;
  }

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
}

export function QrCodeSvg({
  value,
  text,
  size = 180,
  quietZone = 3,
  fgColor = 'currentColor',
  bgColor = 'transparent',
  className = '',
}: {
  value?: string;
  text?: string;
  size?: number;
  quietZone?: number;
  fgColor?: string;
  bgColor?: string;
  className?: string;
}) {
  const content = value ?? text ?? '';
  const { path, viewBoxSize } = useMemo(() => {
    try {
      const matrix = generateQrMatrix(content);
      const modCount = matrix.length;
      const totalSize = modCount + quietZone * 2;
      let pathData = '';

      for (let r = 0; r < modCount; r++) {
        for (let c = 0; c < modCount; c++) {
          if (matrix[r]![c]) {
            const x = c + quietZone;
            const y = r + quietZone;
            pathData += `M${x},${y}h1v1h-1z `;
          }
        }
      }
      return { path: pathData, viewBoxSize: totalSize };
    } catch {
      return { path: '', viewBoxSize: 25 };
    }
  }, [value, quietZone]);

  if (!path) {
    return <div style={{ width: size, height: size, display: 'grid', placeItems: 'center' }}>QR Error</div>;
  }

  return (
    <svg
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', shapeRendering: 'crispEdges', background: bgColor, borderRadius: 8 }}
      aria-label={`QR Code: ${value}`}
      role="img"
    >
      <path d={path} fill={fgColor} />
    </svg>
  );
}
