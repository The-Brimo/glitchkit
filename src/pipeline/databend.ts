import type { DatabendParams } from '../types';
import { mulberry32, seedFromInt } from './rng';

// These browser-encoded JPEGs carry no restart markers, so a single corrupted byte
// desyncs Huffman decoding for everything below it in scan order — one touched byte
// near the top of the stream can visually wreck the entire image. Mutation counts and
// spans are deliberately kept small and mostly independent of file size so the slider
// gives graduated, still-recognizable results instead of jumping straight to full noise.
export function applyDatabend(bytes: Uint8Array, start: number, end: number, params: DatabendParams): Uint8Array {
  const out = bytes.slice();
  const len = end - start;
  if (len <= 0) return out;
  const rand = mulberry32(seedFromInt(params.seed));
  const amount = Math.min(500, Math.max(0, params.amount));
  const t = amount / 500;

  if (params.mode === 'random') {
    // Corruption cascades forward from wherever it lands, so a uniformly random position
    // has high variance — a "low" amount can unluckily land near the top and wreck the
    // whole image anyway. Instead, confine hits to the tail of the stream at low amounts
    // (keeping the top of the image clean) and only open up the full range near max.
    const hits = 1 + Math.round(t * 20);
    const skip = Math.round((1 - t) * len * 0.85);
    const span = Math.max(1, len - skip);
    for (let h = 0; h < hits; h++) {
      const pos = start + skip + Math.floor(rand() * span);
      out[pos] = Math.floor(rand() * 256);
    }
  } else if (params.mode === 'shift') {
    const shift = Math.max(1, Math.round(t * t * len * 0.05)) % len;
    const region = out.slice(start, end);
    for (let i = 0; i < len; i++) {
      out[start + ((i + shift) % len)] = region[i];
    }
  } else {
    const chunkLen = Math.min(len, Math.max(2, Math.round(amount * 3)));
    const skip = Math.round((1 - t) * len * 0.7);
    const maxStart = Math.max(skip, len - chunkLen);
    const chunkStart = start + skip + Math.floor(rand() * (maxStart - skip + 1));
    const region = out.slice(chunkStart, chunkStart + chunkLen);
    for (let i = 0; i < chunkLen; i++) {
      out[chunkStart + i] = region[chunkLen - 1 - i];
    }
  }

  return out;
}
