import type { PaletteName, TrafficDigest, TrafficMapping } from '../types';
import { fieldToImageData } from './palette';
import { hash2 } from './rng';

/**
 * Renders a network-capture digest as the document's source image. Two
 * mappings, both deterministic (replaying the same digest always renders the
 * same pixels — the capture is the entropy, there is no seed):
 *
 * waterfall — y is time, x is remote endpoint, columns ordered heaviest-first.
 * Downstream bytes light a pixel cyan, upstream red/orange, each log-scaled
 * and normalised INDEPENDENTLY, so a telemetry whisper stays visible next to
 * a video shout. Telemetry beacons read as metronome ticks; segmented
 * streaming reads as chunk-fetch dashes.
 *
 * raster — one sampled packet per row, payload bytes left to right as pixels,
 * nearest-neighbour scaled to the canvas so the bytes stay blocky. TLS is
 * noise, MQTT/DNS are legible structure, plaintext is visibly text. Upstream
 * rows are tinted warm.
 *
 * flowfield — every remote endpoint is hashed to a fixed position; each packet
 * deposits its bytes near its remote's position with seeded jitter, the
 * accumulated energy is bloomed and log-compressed into a brightness field,
 * and the field goes through fieldToImageData — so this is the one traffic
 * mapping that speaks the app's palette/gamma/invert language. Busy hosts
 * become glowing clouds; a capture is a constellation of who was talked to.
 *
 * timing — the capture as one continuous ribbon, read like text: for every
 * packet, a dark run proportional to the silence before it, then a lit run
 * proportional to its size, wrapped row-major to exactly fill the frame.
 * Steady telemetry reads as sparse ticks in darkness, segmented streaming as
 * slabs between long gaps, browsing as clustered bursts.
 *
 * hilbert — sampled payload bytes laid along a Hilbert curve on the largest
 * power-of-two square the data can fill, then scaled to the canvas (a square
 * stretched onto the frame, same accepted trade as the reaction sim).
 * Sequential locality survives in 2D, so protocol structure becomes blobs and
 * veins instead of raster's stripes.
 *
 * waterfall and raster mirror tvwatch's render_digest.py; the three field
 * mappings exist only here, and this file is the canonical implementation.
 */

const RASTER_COLS = 256; // bytes per row in the digest's payload samples

export interface TrafficColour {
  palette: PaletteName;
  gamma: number;
  invert: boolean;
}

export function renderTraffic(
  d: TrafficDigest,
  mapping: TrafficMapping,
  width: number,
  height: number,
  colour: TrafficColour
): ImageData {
  switch (mapping) {
    case 'raster':
      return raster(d, width, height);
    case 'flowfield':
      return flowfield(d, width, height, colour);
    case 'timing':
      return timing(d, width, height);
    case 'hilbert':
      return hilbert(d, width, height);
    default:
      return waterfall(d, width, height);
  }
}

/** Direction ink shared by the byte-level mappings: downstream cool, upstream warm. */
function inkFor(v: number, out: number): [number, number, number] {
  return out ? [v, v * 0.72, v * 0.45] : [v * 0.78, v, v * 0.9];
}

/** fnv1a, for pinning a remote endpoint to a stable canvas position. */
function strHash(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/** Light structural check for a digest fetched from the local bridge. */
export function isTrafficDigest(v: unknown): v is TrafficDigest {
  const d = v as TrafficDigest;
  return (
    !!d &&
    typeof d === 'object' &&
    d.kind === 'traffic-digest' &&
    d.v === 1 &&
    typeof d.device === 'string' &&
    typeof d.durationMs === 'number' &&
    Array.isArray(d.remotes) &&
    Array.isArray(d.packets) &&
    d.packets.length > 0 &&
    Array.isArray(d.payloads)
  );
}

function waterfall(d: TrafficDigest, width: number, height: number): ImageData {
  const img = new ImageData(width, height);
  const n = Math.max(1, d.remotes.length);
  const totals = new Float64Array(n);
  for (const [, ri, , len] of d.packets) totals[ri] += len;
  const order = [...totals.keys()].sort((a, b) => totals[b] - totals[a]);
  const colOf = new Int32Array(n);
  order.forEach((ri, rank) => {
    colOf[ri] = rank;
  });
  const band = Math.max(1, Math.floor(width / n));

  const up = new Float64Array(width * height);
  const down = new Float64Array(width * height);
  const dur = Math.max(1, d.durationMs);
  for (const [t, ri, out, len] of d.packets) {
    const row = Math.min(height - 1, Math.floor((t / dur) * height));
    const x0 = Math.min(width - band, colOf[ri] * band);
    const acc = out ? up : down;
    for (let x = x0; x < x0 + band; x++) acc[row * width + x] += len / band;
  }

  let maxU = 0;
  let maxD = 0;
  for (let i = 0; i < up.length; i++) {
    if (up[i] > maxU) maxU = up[i];
    if (down[i] > maxD) maxD = down[i];
  }
  const lu = Math.log1p(maxU);
  const ld = Math.log1p(maxD);
  for (let i = 0; i < up.length; i++) {
    const u = maxU ? Math.log1p(up[i]) / lu : 0;
    const dn = maxD ? Math.log1p(down[i]) / ld : 0;
    const o = i * 4;
    img.data[o] = 5 + 250 * u;
    img.data[o + 1] = 5 + 160 * dn + 80 * u;
    img.data[o + 2] = 7 + 235 * dn;
    img.data[o + 3] = 255;
  }
  return img;
}

// Nearest-neighbour scale of a natural-size RGB plane to the canvas: bytes
// should scale as crisp blocks, not interpolate into mush.
function scaleNearest(nat: Uint8ClampedArray, cols: number, rows: number, width: number, height: number): ImageData {
  const img = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(rows - 1, Math.floor((y / height) * rows));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(cols - 1, Math.floor((x / width) * cols));
      const so = (sy * cols + sx) * 3;
      const o = (y * width + x) * 4;
      img.data[o] = nat[so];
      img.data[o + 1] = nat[so + 1];
      img.data[o + 2] = nat[so + 2];
      img.data[o + 3] = 255;
    }
  }
  return img;
}

function raster(d: TrafficDigest, width: number, height: number): ImageData {
  const rows = Math.max(1, d.payloads.length);
  const nat = new Uint8ClampedArray(RASTER_COLS * rows * 3);
  for (let r = 0; r < d.payloads.length; r++) {
    const [pktIdx, hex] = d.payloads[r];
    const out = d.packets[pktIdx] ? d.packets[pktIdx][2] : 0;
    const bytes = Math.min(RASTER_COLS, hex.length >> 1);
    for (let x = 0; x < RASTER_COLS; x++) {
      const o = (r * RASTER_COLS + x) * 3;
      if (x < bytes) {
        const [cr, cg, cb] = inkFor(parseInt(hex.substr(x * 2, 2), 16), out);
        nat[o] = cr;
        nat[o + 1] = cg;
        nat[o + 2] = cb;
      } else {
        nat[o] = 5;
        nat[o + 1] = 5;
        nat[o + 2] = 7;
      }
    }
  }
  return scaleNearest(nat, RASTER_COLS, rows, width, height);
}

function flowfield(d: TrafficDigest, width: number, height: number, colour: TrafficColour): ImageData {
  const n = Math.max(1, d.remotes.length);
  const cx = new Float64Array(n);
  const cy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    // Stable position per endpoint: the same host lands in the same place in
    // every capture, so repeated captures of one device are comparable.
    const h = strHash(d.remotes[i]);
    cx[i] = (0.12 + 0.76 * ((h & 0xffff) / 0xffff)) * width;
    cy[i] = (0.12 + 0.76 * (((h >>> 16) & 0xffff) / 0xffff)) * height;
  }

  const field = new Float32Array(width * height);
  const spreadBase = Math.min(width, height) * 0.05;
  for (let i = 0; i < d.packets.length; i++) {
    const [, ri, , len] = d.packets[i];
    // Polar jitter, uniform over a disc. Independent per-axis jitter leaves a
    // square footprint, and dense uniform-size CDN traffic (wall-to-wall MTU
    // packets, so identical spread) rendered its hosts as hard-edged boxes.
    // Deterministic per packet index — no seed, same capture same picture.
    const angle = hash2(i, 0, 1) * Math.PI * 2;
    const radius = Math.sqrt(hash2(i, 1, 1));
    const spread = spreadBase * (0.6 + Math.log1p(len) * 0.12);
    const x = Math.round(cx[ri] + Math.cos(angle) * radius * spread);
    const y = Math.round(cy[ri] + Math.sin(angle) * radius * spread);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    field[y * width + x] += len;
  }

  // Bloom, then log-compress: traffic volume is heavy-tailed, and without the
  // log a single busy CDN flattens every other host to black.
  const bloomed = boxBlur(field, width, height, Math.max(1, Math.round(Math.min(width, height) * 0.006)));
  let max = 0;
  for (let i = 0; i < bloomed.length; i++) if (bloomed[i] > max) max = bloomed[i];
  const norm = max > 0 ? 1 / Math.log1p(max) : 0;
  const out = new Float32Array(bloomed.length);
  for (let i = 0; i < bloomed.length; i++) out[i] = Math.log1p(bloomed[i]) * norm;
  return fieldToImageData(out, width, height, colour.palette, colour.gamma, colour.invert);
}

// Separable box blur (same shape as contour's, local on purpose: the two files
// should stay independently readable).
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const clampI = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);
  const norm = 1 / (2 * r + 1);
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + clampI(i, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      sum += src[row + clampI(x + r + 1, w - 1)] - src[row + clampI(x - r, w - 1)];
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[clampI(i, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[clampI(y + r + 1, h - 1) * w + x] - tmp[clampI(y - r, h - 1) * w + x];
    }
  }
  return out;
}

function timing(d: TrafficDigest, width: number, height: number): ImageData {
  const img = new ImageData(width, height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = 5;
    img.data[i + 1] = 5;
    img.data[i + 2] = 7;
  }

  // Pass 1: total ribbon length in abstract units — a dark run for the silence
  // before each packet, a lit run for the packet itself. Log on both: gaps and
  // sizes each span four-plus orders of magnitude.
  let maxLen = 1;
  for (const [, , , len] of d.packets) if (len > maxLen) maxLen = len;
  const gapUnits = (ms: number) => Math.log1p(Math.max(0, ms));
  const litUnits = (len: number) => 1 + Math.log1p(len) * 0.45;
  let total = 0;
  let prevT = 0;
  for (const [t, , , len] of d.packets) {
    total += gapUnits(t - prevT) + litUnits(len);
    prevT = t;
  }
  if (total <= 0) return img;

  // Pass 2: walk the ribbon row-major, scaled to exactly fill the frame.
  const scale = (width * height) / total;
  const lMax = Math.log1p(maxLen);
  let cursor = 0;
  let acc = 0;
  prevT = 0;
  const fill = (until: number, rgb: [number, number, number] | null) => {
    const end = Math.min(width * height, Math.round(until));
    if (rgb) {
      for (let p = cursor; p < end; p++) {
        const o = p * 4;
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
      }
    }
    cursor = Math.max(cursor, end);
  };
  for (const [t, , out, len] of d.packets) {
    acc += gapUnits(t - prevT) * scale;
    fill(acc, null); // silence stays ground
    acc += litUnits(len) * scale;
    const v = 90 + 165 * (Math.log1p(len) / lMax);
    fill(acc, inkFor(v, out));
    prevT = t;
  }
  return img;
}

function hilbert(d: TrafficDigest, width: number, height: number): ImageData {
  // Flatten the sampled payloads into one byte stream with per-byte direction.
  let total = 0;
  for (const [, hex] of d.payloads) total += hex.length >> 1;
  if (total === 0) {
    const empty = new Uint8ClampedArray(3).fill(5);
    return scaleNearest(empty, 1, 1, width, height);
  }

  // Largest power-of-two square the stream can cover, so the curve has no
  // dead corner; tiny captures repeat their stream instead (min side 64).
  let side = 64;
  while (side * 2 <= 1024 && side * side * 4 <= total) side *= 2;

  const cells = side * side;
  const nat = new Uint8ClampedArray(cells * 3);

  // Walk the curve cell by cell, consuming the byte stream (repeating if the
  // capture is smaller than the square).
  let row = 0;
  let col = 0; // position within current payload row
  const byteAt = (): [number, number] => {
    // Sequential reader with wraparound.
    while (true) {
      const [pktIdx, hex] = d.payloads[row];
      const n = hex.length >> 1;
      if (col < n) {
        const v = parseInt(hex.substr(col * 2, 2), 16);
        col++;
        return [v, d.packets[pktIdx] ? d.packets[pktIdx][2] : 0];
      }
      col = 0;
      row = (row + 1) % d.payloads.length;
    }
  };

  for (let i = 0; i < cells; i++) {
    // d2xy: standard iterative Hilbert index-to-position.
    let t = i;
    let x = 0;
    let y = 0;
    for (let s = 1; s < side; s *= 2) {
      const rx = 1 & (t >> 1);
      const ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        const k = x;
        x = y;
        y = k;
      }
      x += s * rx;
      y += s * ry;
      t >>= 2;
    }
    const [v, out] = byteAt();
    const [cr, cg, cb] = inkFor(v, out);
    const o = (y * side + x) * 3;
    nat[o] = cr;
    nat[o + 1] = cg;
    nat[o + 2] = cb;
  }
  return scaleNearest(nat, side, side, width, height);
}
