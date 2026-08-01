import type { DisplaceParams } from '../types';
import { hash2 } from './rng';

// Smooth 1D noise built from the same hash used by the generators, so "scale" reads
// as a spatial frequency: low scale = long lazy waves, high scale = jittery per-line offsets.
function lineNoise(i: number, scale: number, seed: number): number {
  const t = i / Math.max(1, scale);
  const i0 = Math.floor(t);
  const i1 = i0 + 1;
  const f = t - i0;
  const s = f * f * (3 - 2 * f);
  const a = hash2(i0, 0, seed) * 2 - 1;
  const b = hash2(i1, 0, seed) * 2 - 1;
  return a + (b - a) * s;
}

export function displace(src: ImageData, params: DisplaceParams, seed: number): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const rows = params.axis === 'rows';
  const lineCount = rows ? height : width;

  const offsets = new Int32Array(lineCount);
  for (let i = 0; i < lineCount; i++) {
    offsets[i] = Math.round(lineNoise(i, 40 / Math.max(1, params.scale), seed) * params.amount);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = x;
      let sy = y;
      if (rows) {
        sx = ((x - offsets[y]) % width + width) % width;
      } else {
        sy = ((y - offsets[x]) % height + height) % height;
      }
      const srcO = (sy * width + sx) * 4;
      const dstO = (y * width + x) * 4;
      out[dstO] = data[srcO];
      out[dstO + 1] = data[srcO + 1];
      out[dstO + 2] = data[srcO + 2];
      out[dstO + 3] = data[srcO + 3];
    }
  }

  return new ImageData(out, width, height);
}
