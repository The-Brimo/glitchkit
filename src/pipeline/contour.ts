import type { ContourParams } from '../types';

/**
 * Draws lines along the image's structure — iso-luma bands (a topographic map
 * of brightness) or edges (Sobel) — onto a near-black ground. Additive and
 * input-reading, like glyphs: the marks are new, but the image decides where
 * they go. normal/100 gives a pure line drawing; screen lays the lines over
 * the picture.
 *
 * Fully deterministic: no seed, no randomness — the same image always traces
 * the same lines.
 *
 * `weight` (line thickness) and `smooth` (pre-analysis blur radius) are
 * authored in final-render pixels and scaled by `renderScale`, per the
 * preview-fidelity contract. Without scaling `smooth`, a downscaled preview
 * analyses a relatively blurrier field and draws fewer, rounder contours than
 * the export.
 */

const BG: [number, number, number] = [5, 5, 7];
const INK_WHITE: [number, number, number] = [235, 235, 242];

function clampIdx(v: number, max: number): number {
  return v < 0 ? 0 : v > max ? max : v;
}

// Separable box blur, O(n) per axis via running sum. One pass is enough here:
// the goal is only to keep single-pixel noise from shattering the contours.
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r < 1) return src;
  const norm = 1 / (2 * r + 1);
  const tmp = new Float32Array(src.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[row + clampIdx(i, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * norm;
      sum += src[row + clampIdx(x + r + 1, w - 1)] - src[row + clampIdx(x - r, w - 1)];
    }
  }
  const out = new Float32Array(src.length);
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += tmp[clampIdx(i, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[clampIdx(y + r + 1, h - 1) * w + x] - tmp[clampIdx(y - r, h - 1) * w + x];
    }
  }
  return out;
}

export function contourTrace(src: ImageData, p: ContourParams, renderScale: number): ImageData {
  const { width: w, height: h, data } = src;

  const luma = new Float32Array(w * h);
  for (let i = 0, j = 0; j < luma.length; i += 4, j++) {
    luma[j] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const field = boxBlur(luma, w, h, Math.max(0, p.smooth) * renderScale);

  // mask[i] = 0 for ground, else contour with a 0..1 grade for the graded ink.
  const grade = new Float32Array(w * h);

  if (p.mode === 'iso') {
    // A pixel is on a contour where its quantised band differs from the pixel
    // to its right or below — the boundary lines of a topographic map.
    const levels = Math.max(2, Math.min(16, Math.round(p.levels)));
    const bandOf = (v: number) => Math.min(levels - 1, Math.floor((v / 256) * levels));
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const i = y * w + x;
        const b = bandOf(field[i]);
        if (b !== bandOf(field[i + 1]) || b !== bandOf(field[i + w])) {
          grade[i] = levels > 1 ? b / (levels - 1) : 1;
        }
      }
    }
  } else {
    // Sobel magnitude, thresholded by HISTOGRAM QUANTILE rather than a raw
    // gradient value: `coverage` directly selects what fraction of the frame
    // counts as edge, strongest first. Monotone by construction and consistent
    // across images — a dim soft image and a harsh one both give the slider
    // the same meaning. The floor keeps coverage 0's behaviour on-contract:
    // it still traces the strongest 0.2% rather than going silently blank.
    const coverage = Math.min(100, Math.max(0, p.coverage)) / 100;
    const targetFrac = 0.002 + coverage * coverage * 0.35;

    const mag = new Float32Array(w * h);
    let maxMag = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx =
          field[i - w + 1] + 2 * field[i + 1] + field[i + w + 1] -
          (field[i - w - 1] + 2 * field[i - 1] + field[i + w - 1]);
        const gy =
          field[i + w - 1] + 2 * field[i + w] + field[i + w + 1] -
          (field[i - w - 1] + 2 * field[i - w] + field[i - w + 1]);
        const m = Math.sqrt(gx * gx + gy * gy);
        mag[i] = m;
        if (m > maxMag) maxMag = m;
      }
    }

    let thresh = 0;
    if (maxMag > 0) {
      const BINS = 512;
      const hist = new Uint32Array(BINS);
      for (let i = 0; i < mag.length; i++) {
        hist[Math.min(BINS - 1, Math.floor((mag[i] / maxMag) * BINS))]++;
      }
      let acc = 0;
      const cutoff = mag.length * targetFrac;
      for (let b = BINS - 1; b >= 0; b--) {
        acc += hist[b];
        if (acc >= cutoff) {
          thresh = (b / BINS) * maxMag;
          break;
        }
      }
      // All-flat image: every pixel in bin 0; never treat 0 as an edge.
      thresh = Math.max(thresh, 1e-6);
    } else {
      thresh = Infinity;
    }

    for (let i = 0; i < mag.length; i++) {
      if (mag[i] >= thresh) grade[i] = Math.min(1, mag[i] / (thresh * 4));
    }
  }

  // Line weight: stamp a wPx-wide square so every width 1..4 is distinct —
  // a symmetric radius would render weights 2 and 3 identically (a dead zone).
  //
  // A line cannot be drawn thinner than 1px, so when the scaled weight lands
  // below the floor the preview would show relatively MORE ink than the export
  // (measured +79% at weight 1 on a 900px preview of a 1600px document — line
  // length scales with the frame, a 1px width does not). `alphaComp` dims the
  // line toward the ground by the shortfall, the same thing antialiasing does
  // for a sub-pixel stroke, so apparent ink mass matches the export. At full
  // render effWeight is integral, wPx equals it, and alphaComp is exactly 1.
  //
  // ISO ONLY: iso ink mass is length-based (length scales with the frame,
  // width does not), which is exactly what alphaComp corrects — measured
  // +79% -> -0.3%. Edge mode is already area-exact by construction: the
  // quantile threshold selects a fraction of the FRAME, which is scale-free,
  // and dimming on top of that overcorrects (measured -43%). Edge's own
  // residual lives at weight > 1, where integer dilation on a downscaled
  // frame drifts up to ~-23% ink mass in the preview; exact matching would
  // need iterative post-dilation thresholding, and the default weight 1 is
  // exact, so it is documented rather than chased — same call as halftone's
  // half-pixel dots residual.
  const effWeight = Math.max(0.05, p.weight * renderScale);
  const wPx = Math.max(1, Math.round(effWeight));
  const alphaComp = p.mode === 'iso' ? Math.min(1, effWeight / wPx) : 1;
  let mask = grade;
  if (wPx > 1) {
    const lo = -Math.floor((wPx - 1) / 2);
    const hi = Math.ceil((wPx - 1) / 2);
    const thick = new Float32Array(grade.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const g = grade[y * w + x];
        if (g === 0) continue;
        for (let dy = lo; dy <= hi; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = lo; dx <= hi; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const o = yy * w + xx;
            if (g > thick[o]) thick[o] = g;
          }
        }
      }
    }
    mask = thick;
  }

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0, j = 0; j < mask.length; i += 4, j++) {
    const g = mask[j];
    if (g === 0) {
      out[i] = BG[0];
      out[i + 1] = BG[1];
      out[i + 2] = BG[2];
      out[i + 3] = 255;
      continue;
    }
    let r: number;
    let gr: number;
    let b: number;
    if (p.ink === 'sample') {
      r = data[i];
      gr = data[i + 1];
      b = data[i + 2];
    } else {
      const level = p.ink === 'graded' ? 0.35 + 0.65 * g : 1;
      r = INK_WHITE[0] * level;
      gr = INK_WHITE[1] * level;
      b = INK_WHITE[2] * level;
    }
    out[i] = BG[0] + (r - BG[0]) * alphaComp;
    out[i + 1] = BG[1] + (gr - BG[1]) * alphaComp;
    out[i + 2] = BG[2] + (b - BG[2]) * alphaComp;
    out[i + 3] = 255;
  }
  return new ImageData(out, w, h);
}
