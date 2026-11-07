import type { TrafficDigest, TrafficMapping } from '../types';

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
 * These mirror tvwatch's render_digest.py, the reference implementation —
 * keep the two in agreement.
 */

const RASTER_COLS = 256; // bytes per row in the digest's payload samples

export function renderTraffic(
  d: TrafficDigest,
  mapping: TrafficMapping,
  width: number,
  height: number
): ImageData {
  return mapping === 'raster' ? raster(d, width, height) : waterfall(d, width, height);
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

function raster(d: TrafficDigest, width: number, height: number): ImageData {
  const rows = Math.max(1, d.payloads.length);

  // Natural-size byte grid first; r/g/b planes so the scale pass stays simple.
  const nat = new Uint8ClampedArray(RASTER_COLS * rows * 3);
  for (let r = 0; r < d.payloads.length; r++) {
    const [pktIdx, hex] = d.payloads[r];
    const out = d.packets[pktIdx] ? d.packets[pktIdx][2] : 0;
    const bytes = Math.min(RASTER_COLS, hex.length >> 1);
    for (let x = 0; x < RASTER_COLS; x++) {
      const o = (r * RASTER_COLS + x) * 3;
      if (x < bytes) {
        const v = parseInt(hex.substr(x * 2, 2), 16);
        nat[o] = out ? v : v * 0.78;
        nat[o + 1] = out ? v * 0.72 : v;
        nat[o + 2] = out ? v * 0.45 : v * 0.9;
      } else {
        nat[o] = 5;
        nat[o + 1] = 5;
        nat[o + 2] = 7;
      }
    }
  }

  // Nearest-neighbour to the canvas: bytes should scale as crisp blocks, not
  // interpolate into mush — this is the same reason the mask demos pin
  // imageSmoothing off.
  const img = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(rows - 1, Math.floor((y / height) * rows));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(RASTER_COLS - 1, Math.floor((x / width) * RASTER_COLS));
      const so = (sy * RASTER_COLS + sx) * 3;
      const o = (y * width + x) * 4;
      img.data[o] = nat[so];
      img.data[o + 1] = nat[so + 1];
      img.data[o + 2] = nat[so + 2];
      img.data[o + 3] = 255;
    }
  }
  return img;
}
