import { hash2, seedFromInt } from './rng';

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = smoothstep(x - x0);
  const sy = smoothstep(y - y0);

  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x1, y0, seed);
  const n01 = hash2(x0, y1, seed);
  const n11 = hash2(x1, y1, seed);

  const ix0 = n00 + (n10 - n00) * sx;
  const ix1 = n01 + (n11 - n01) * sx;
  return ix0 + (ix1 - ix0) * sy;
}

function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise2D(x * freq, y * freq, seed + o * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

export interface NoiseParams {
  seed: number;
  width: number;
  height: number;
  octaves: number;
  freq: number;
  warp: number;
}

// Returns a Float32Array of brightness values in [0, 1], row-major.
export function generateNoiseField(p: NoiseParams): Float32Array {
  const seed = seedFromInt(p.seed);
  const field = new Float32Array(p.width * p.height);
  const scale = p.freq / Math.max(p.width, p.height);
  const aspect = p.width / p.height;

  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const nx = x * scale;
      const ny = (y * scale) / aspect;

      let sx = nx;
      let sy = ny;
      if (p.warp > 0) {
        const qx = fbm(nx + 5.2, ny + 1.3, seed + 11, 4);
        const qy = fbm(nx - 3.7, ny + 8.1, seed + 23, 4);
        sx = nx + p.warp * (qx - 0.5) * 2;
        sy = ny + p.warp * (qy - 0.5) * 2;
      }

      field[y * p.width + x] = fbm(sx, sy, seed, p.octaves);
    }
  }
  return field;
}
