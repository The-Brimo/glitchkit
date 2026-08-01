import type { AudioLabParams } from '../types';
import { hash2 } from './rng';

// Samples are 16-bit LE pairs of raw RGB bytes — the design's "headerless PCM" — so byte
// position maps linearly onto pixel position. Delay-based effects are scaled to the data
// length and snapped to whole image rows (rowStride = samples per row) so an echo reads
// as a vertical ghost of the image and a reversed segment as a mirrored band, the way the
// original Audacity round-trip behaved on uncompressed image data. Fixed sample-count
// delays would land at sub-row offsets far too small to see.

function bytesToSamples(bytes: Uint8Array, start: number, end: number): Int16Array {
  const usableLen = (end - start) & ~1;
  const samples = new Int16Array(usableLen / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, usableLen);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
  return samples;
}

function samplesToBytes(samples: Int16Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(i * 2, samples[i], true);
  return out;
}

function clampI16(v: number): number {
  return Math.max(-32768, Math.min(32767, v));
}

function snapToRows(samples: number, rowStride: number): number {
  return Math.max(1, Math.round(samples / rowStride)) * rowStride;
}

function echo(x: Int16Array, time: number, depth: number, extend: boolean, rowStride: number): Float64Array {
  const t = time / 100;
  const delay = snapToRows(t * t * x.length * 0.35, rowStride);
  const feedback = (depth / 100) * 0.85;
  const tail = extend ? delay * 2 : 0;
  const y = new Float64Array(x.length + tail);
  for (let n = 0; n < y.length; n++) {
    const dry = n < x.length ? x[n] : 0;
    const past = n - delay >= 0 ? y[n - delay] : 0;
    y[n] = dry + feedback * past;
  }
  return y;
}

function reverb(x: Int16Array, time: number, depth: number, extend: boolean, rowStride: number): Float64Array {
  const roomRows = 0.5 + (time / 100) * 6;
  const combDelays = [1, 1.3, 1.7, 2.3].map((m) => Math.max(1, Math.round(rowStride * m * roomRows)));
  const decay = (depth / 100) * 0.88;
  const tail = extend ? Math.max(...combDelays) * 2 : 0;
  const y = new Float64Array(x.length + tail);
  for (const delay of combDelays) {
    const buf = new Float64Array(y.length);
    for (let n = 0; n < buf.length; n++) {
      const dry = n < x.length ? x[n] : 0;
      const past = n - delay >= 0 ? buf[n - delay] : 0;
      buf[n] = dry + decay * past;
    }
    for (let n = 0; n < y.length; n++) y[n] += buf[n] / combDelays.length;
  }
  return y;
}

function bitcrush(x: Int16Array, time: number, depth: number): Float64Array {
  const bits = Math.max(1, Math.round(16 - (time / 100) * 14));
  const levels = Math.pow(2, bits);
  const step = 65536 / levels;
  const holdFactor = Math.max(1, Math.round((depth / 100) * 24));
  const y = new Float64Array(x.length);
  let held = 0;
  for (let n = 0; n < x.length; n++) {
    if (n % holdFactor === 0) {
      held = Math.round(x[n] / step) * step;
    }
    y[n] = held;
  }
  return y;
}

function reverseEffect(x: Int16Array, time: number, depth: number, rowStride: number): Float64Array {
  const t = time / 100;
  const segLen = snapToRows(t * t * x.length * 0.12, rowStride);
  const affectFraction = depth / 100;
  const y = new Float64Array(x.length);
  y.set(x);
  const segCount = Math.ceil(x.length / segLen);
  for (let s = 0; s < segCount; s++) {
    if (hash2(s, 0, 4242) >= affectFraction) continue;
    const start = s * segLen;
    const end = Math.min(x.length, start + segLen);
    for (let i = start, j = end - 1; i < j; i++, j--) {
      const tmp = y[i];
      y[i] = y[j];
      y[j] = tmp;
    }
  }
  return y;
}

function amplify(x: Int16Array, time: number, depth: number): Float64Array {
  const gain = 1 + (time / 100) * 9;
  const threshold = 32767 * (1 - (depth / 100) * 0.9);
  const y = new Float64Array(x.length);
  for (let n = 0; n < x.length; n++) {
    y[n] = Math.max(-threshold, Math.min(threshold, x[n] * gain));
  }
  return y;
}

function phaser(x: Int16Array, time: number, depth: number, rowStride: number): Float64Array {
  // Modulation period spans whole rows (8.5 rows down to 0.5 as rate rises), producing
  // horizontal interference bands; sweep displaces up to half a row sideways.
  const period = Math.max(2, rowStride * (8.5 - (time / 100) * 8));
  const omega = (Math.PI * 2) / period;
  const sweep = (depth / 100) * rowStride * 0.5;
  const y = new Float64Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const modDelay = sweep * (0.5 + 0.5 * Math.sin(n * omega));
    const d0 = Math.floor(modDelay);
    const frac = modDelay - d0;
    const i0 = Math.max(0, n - d0);
    const i1 = Math.max(0, n - d0 - 1);
    const delayed = x[i0] * (1 - frac) + x[i1] * frac;
    y[n] = (x[n] + delayed) * 0.5;
  }
  return y;
}

export function applyAudioLab(
  bytes: Uint8Array,
  start: number,
  end: number,
  params: AudioLabParams,
  rowStride = 2048
): Uint8Array {
  const dry = bytesToSamples(bytes, start, end);
  const extend = !params.lockLength;
  let wet: Float64Array;
  switch (params.effect) {
    case 'echo':
      wet = echo(dry, params.time, params.depth, extend, rowStride);
      break;
    case 'reverb':
      wet = reverb(dry, params.time, params.depth, extend, rowStride);
      break;
    case 'bitcrush':
      wet = bitcrush(dry, params.time, params.depth);
      break;
    case 'reverse':
      wet = reverseEffect(dry, params.time, params.depth, rowStride);
      break;
    case 'amplify':
      wet = amplify(dry, params.time, params.depth);
      break;
    case 'phaser':
      wet = phaser(dry, params.time, params.depth, rowStride);
      break;
  }

  const mix = Math.min(100, Math.max(0, params.mix)) / 100;
  const outLen = params.lockLength ? dry.length : wet.length;
  const mixed = new Int16Array(outLen);
  for (let n = 0; n < outLen; n++) {
    const d = n < dry.length ? dry[n] : 0;
    const w = n < wet.length ? wet[n] : 0;
    mixed[n] = clampI16(d * (1 - mix) + w * mix);
  }

  const processedTail = samplesToBytes(mixed);
  if (params.lockLength) {
    const out = bytes.slice();
    out.set(processedTail.subarray(0, end - start), start);
    return out;
  }
  const out = new Uint8Array(start + processedTail.length + (bytes.length - end));
  out.set(bytes.subarray(0, start), 0);
  out.set(processedTail, start);
  out.set(bytes.subarray(end), start + processedTail.length);
  return out;
}
