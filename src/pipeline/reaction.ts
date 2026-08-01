import { mulberry32, seedFromInt } from './rng';
import type { ReactionPreset } from '../types';

// Gray-Scott feed/kill pairs tuned per preset (Pearson-style parameter space).
const PRESETS: Record<ReactionPreset, { f: number; k: number }> = {
  coral: { f: 0.0545, k: 0.062 },
  maze: { f: 0.0295, k: 0.0575 },
  spots: { f: 0.03, k: 0.063 },
  mitosis: { f: 0.0367, k: 0.0649 },
  fingerprint: { f: 0.05, k: 0.063 },
  flower: { f: 0.018, k: 0.05 },
};

const DU = 0.16;
const DV = 0.08;
const DT = 1.0;

export interface ReactionParams {
  seed: number;
  width: number;
  height: number;
  preset: ReactionPreset;
  steps: number;
  sim: number;
  onProgress?: (fraction: number) => void;
}

function laplacian(a: Float32Array, n: number, x: number, y: number): number {
  const xm = x === 0 ? n - 1 : x - 1;
  const xp = x === n - 1 ? 0 : x + 1;
  const ym = y === 0 ? n - 1 : y - 1;
  const yp = y === n - 1 ? 0 : y + 1;
  const i = y * n + x;
  return (
    a[y * n + xm] * 0.2 +
    a[y * n + xp] * 0.2 +
    a[ym * n + x] * 0.2 +
    a[yp * n + x] * 0.2 +
    a[ym * n + xm] * 0.05 +
    a[ym * n + xp] * 0.05 +
    a[yp * n + xm] * 0.05 +
    a[yp * n + xp] * 0.05 -
    a[i] * 1
  );
}

function bilinearSample(field: Float32Array, n: number, u: number, v: number): number {
  const x = u * (n - 1);
  const y = v * (n - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, n - 1);
  const y1 = Math.min(y0 + 1, n - 1);
  const sx = x - x0;
  const sy = y - y0;
  const a = field[y0 * n + x0];
  const b = field[y0 * n + x1];
  const c = field[y1 * n + x0];
  const d = field[y1 * n + x1];
  return a * (1 - sx) * (1 - sy) + b * sx * (1 - sy) + c * (1 - sx) * sy + d * sx * sy;
}

export async function generateReactionField(p: ReactionParams): Promise<Float32Array> {
  const n = Math.max(32, Math.min(320, Math.round(p.sim)));
  const { f, k } = PRESETS[p.preset];
  const rand = mulberry32(seedFromInt(p.seed));

  const u = new Float32Array(n * n).fill(1);
  const v = new Float32Array(n * n).fill(0);

  const blobCount = 4 + Math.floor(rand() * 4);
  for (let b = 0; b < blobCount; b++) {
    const cx = Math.floor(rand() * n);
    const cy = Math.floor(rand() * n);
    const r = Math.max(2, Math.round(n * 0.03));
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        if (x * x + y * y > r * r) continue;
        const px = ((cx + x) % n + n) % n;
        const py = ((cy + y) % n + n) % n;
        u[py * n + px] = 0.5;
        v[py * n + px] = 0.25 + rand() * 0.25;
      }
    }
  }

  let uCur = u;
  let vCur = v;
  let uNext = new Float32Array(n * n);
  let vNext = new Float32Array(n * n);

  const steps = Math.max(1, Math.round(p.steps));
  const CHUNK = 40;
  for (let s = 0; s < steps; s++) {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const i = y * n + x;
        const uv2 = uCur[i] * vCur[i] * vCur[i];
        uNext[i] = uCur[i] + (DU * laplacian(uCur, n, x, y) - uv2 + f * (1 - uCur[i])) * DT;
        vNext[i] = vCur[i] + (DV * laplacian(vCur, n, x, y) + uv2 - (f + k) * vCur[i]) * DT;
      }
    }
    [uCur, uNext] = [uNext, uCur];
    [vCur, vNext] = [vNext, vCur];

    if (s % CHUNK === 0) {
      p.onProgress?.(s / steps);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  p.onProgress?.(1);

  let vmin = Infinity;
  let vmax = -Infinity;
  for (let i = 0; i < vCur.length; i++) {
    if (vCur[i] < vmin) vmin = vCur[i];
    if (vCur[i] > vmax) vmax = vCur[i];
  }
  const range = Math.max(1e-6, vmax - vmin);
  const normalized = new Float32Array(vCur.length);
  for (let i = 0; i < vCur.length; i++) normalized[i] = (vCur[i] - vmin) / range;

  const field = new Float32Array(p.width * p.height);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      field[y * p.width + x] = bilinearSample(normalized, n, x / (p.width - 1 || 1), y / (p.height - 1 || 1));
    }
  }
  return field;
}
