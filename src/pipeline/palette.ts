import type { PaletteName } from '../types';

export const PALETTES: Record<PaletteName, { from: [number, number, number]; to: [number, number, number] }> = {
  ember: { from: hex('#0f6b66'), to: hex('#ff8a3d') },
  ice: { from: hex('#0a2a5e'), to: hex('#eef6ff') },
  magma: { from: hex('#3b0764'), to: hex('#facc15') },
  acid: { from: hex('#14532d'), to: hex('#a3e635') },
  mono: { from: hex('#111111'), to: hex('#f5f5f5') },
};

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function fieldToImageData(
  field: Float32Array,
  width: number,
  height: number,
  palette: PaletteName,
  gamma: number,
  invert: boolean
): ImageData {
  const { from, to } = PALETTES[palette];
  const data = new Uint8ClampedArray(width * height * 4);
  const g = Math.max(0.01, gamma);

  for (let i = 0; i < field.length; i++) {
    let t = field[i];
    if (invert) t = 1 - t;
    t = Math.pow(Math.min(1, Math.max(0, t)), g);

    const o = i * 4;
    data[o] = from[0] + (to[0] - from[0]) * t;
    data[o + 1] = from[1] + (to[1] - from[1]) * t;
    data[o + 2] = from[2] + (to[2] - from[2]) * t;
    data[o + 3] = 255;
  }

  return new ImageData(data, width, height);
}
