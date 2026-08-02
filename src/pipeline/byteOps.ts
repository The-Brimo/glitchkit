import type { ByteOpsParams } from '../types';
import { hash2 } from './rng';

// No seed param on this transform in the design, so coverage selection uses a fixed
// internal salt — still deterministic (same input -> same output) without exposing a knob.
const SALT = 1337;

// Browser-encoded JPEGs have no restart markers, so touching even a modest fraction of
// scan bytes desyncs Huffman decoding from that point on and wrecks everything below it.
// "Coverage" is remapped through a cubic curve onto a small max density AND the touchable
// region is confined to the tail of the stream at low coverage (keeping the top of the
// image clean) — otherwise even a sparse density still lands its first hit within the
// first ~1/density bytes, which for realistic file sizes is still near the very start.
const MAX_DENSITY = 0.2;

function applyOp(b: number, op: ByteOpsParams['op'], value: number): number {
  switch (op) {
    case 'xor':
      return b ^ value;
    case 'and':
      return b & value;
    case 'add':
      return (b + value) & 0xff;
    case 'rotate': {
      const shift = value % 8;
      return ((b << shift) | (b >>> (8 - shift))) & 0xff;
    }
  }
}

export function applyByteOps(bytes: Uint8Array, start: number, end: number, params: ByteOpsParams): Uint8Array {
  const out = bytes.slice();
  const len = end - start;
  const coverageT = Math.min(100, Math.max(0, params.coverage)) / 100;
  const density = coverageT * coverageT * coverageT * MAX_DENSITY;
  const skip = start + Math.round((1 - coverageT) * len * 0.85);
  const value = Math.min(255, Math.max(0, Math.round(params.value)));

  let applied = false;
  for (let i = skip; i < end; i++) {
    if (hash2(i, 0, SALT) >= density) continue;
    out[i] = applyOp(out[i], params.op, value);
    applied = true;
  }

  // The cubic curve rounds very low coverage down to selecting nothing —
  // measured: coverage 5 and 10 mutated zero bytes, a dead slider zone. A
  // single guaranteed application keeps any nonzero coverage visible (one
  // corrupted byte cascades), without changing the curve. Identity settings
  // (xor 0, and 255, add 0) still correctly do nothing.
  if (!applied && coverageT > 0 && end > skip) {
    const i = skip + Math.floor(hash2(0, 1, SALT) * (end - skip));
    out[i] = applyOp(out[i], params.op, value);
  }

  return out;
}
