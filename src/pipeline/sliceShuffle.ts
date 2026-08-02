import type { SliceShuffleParams } from '../types';
import { mulberry32, seedFromInt } from './rng';

export function sliceShuffle(src: ImageData, params: SliceShuffleParams): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const rows = params.axis === 'rows';
  const count = Math.max(2, Math.min(64, Math.round(params.slices)));
  const total = rows ? height : width;
  const rand = mulberry32(seedFromInt(params.seed));

  const bounds: number[] = [];
  for (let i = 0; i <= count; i++) bounds.push(Math.round((i * total) / count));

  // Pick which slices participate, then permute only those among themselves —
  // unselected slices stay put, so low amounts read as a few displaced bands.
  const selected: number[] = [];
  for (let i = 0; i < count; i++) {
    if (rand() < params.amount / 100) selected.push(i);
  }
  // Any nonzero amount must do SOMETHING. With the old plain shuffle, a random
  // permutation keeps elements in place with expectation 1, so the 1-2 slices
  // typically selected at low amounts collapsed to the identity most of the
  // time — measured: amount 15 was a complete no-op for 22 of 30 seeds. Two
  // fixes: nonzero amounts select at least 2 slices, and Sattolo's algorithm
  // (j strictly below i) produces a uniform random CYCLE, which has no fixed
  // points — every selected slice actually moves.
  if (params.amount > 0 && selected.length < 2) {
    while (selected.length < 2) {
      const extra = Math.floor(rand() * count);
      if (!selected.includes(extra)) selected.push(extra);
    }
    selected.sort((a, b) => a - b);
  }
  const perm = [...selected];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * i);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const mapping = Array.from({ length: count }, (_, i) => i);
  selected.forEach((slot, k) => {
    mapping[slot] = perm[k];
  });

  for (let slot = 0; slot < count; slot++) {
    const srcSlice = mapping[slot];
    const dstStart = bounds[slot];
    const dstLen = bounds[slot + 1] - dstStart;
    const srcStart = bounds[srcSlice];
    const srcLen = bounds[srcSlice + 1] - srcStart;

    for (let i = 0; i < dstLen; i++) {
      // Slice lengths can differ by a pixel when the axis doesn't divide evenly; clamp.
      const srcPos = srcStart + Math.min(i, srcLen - 1);
      const dstPos = dstStart + i;
      if (rows) {
        out.set(data.subarray(srcPos * width * 4, (srcPos + 1) * width * 4), dstPos * width * 4);
      } else {
        for (let y = 0; y < height; y++) {
          const so = (y * width + srcPos) * 4;
          const do_ = (y * width + dstPos) * 4;
          out[do_] = data[so];
          out[do_ + 1] = data[so + 1];
          out[do_ + 2] = data[so + 2];
          out[do_ + 3] = data[so + 3];
        }
      }
    }
  }

  return new ImageData(out, width, height);
}
