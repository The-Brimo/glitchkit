import type { SigilApply, SigilParams } from '../types';
import { mulberry32 } from './rng';

/**
 * Sigil: a text phrase, reduced and salted, hashed into eight sub-seeds that
 * drive a seeded frequency spectrum; the inverse FFT of that spectrum is the
 * sigil texture, applied to the image as displacement, a gate, a layer, or a
 * spectral imprint.
 *
 * ONE-WAY BY CONSTRUCTION, and the architecture enforces it: this module only
 * ever sees the derived seeds. The phrase and salt exist in the panel's
 * component state during charging and nowhere else — step params, recipes and
 * export metadata carry the eight uint32s and the visible knobs, nothing that
 * can be reversed to text (SHA-256 stands between). Keep it that way: no
 * param, log line or cache key may ever hold the phrase.
 *
 * Deterministic given the seeds: same seeds + params render pixel-identical,
 * which is what makes a charged sigil verifiable later from its recipe.
 */

/* ── Derivation (used by the panel at charge time, never at render) ── */

/** Classic Spare-style reduction: "i am focused" -> "mfcsd". */
export function reducePhrase(phrase: string, reduce: boolean): string {
  let s = phrase
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (reduce) {
    s = s.replace(/[^a-z]/g, '').replace(/[aeiou]/g, '');
    s = [...new Set(s)].join('');
  }
  return s;
}

/** SHA-256(reduced + '|' + salt) -> eight uint32 sub-seeds. */
export async function deriveSeeds(phrase: string, salt: string, reduce: boolean): Promise<number[]> {
  const data = new TextEncoder().encode(reducePhrase(phrase, reduce) + '|' + salt);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  const dv = new DataView(hash.buffer);
  return Array.from({ length: 8 }, (_, i) => dv.getUint32(i * 4));
}

/* ── FFT (radix-2, iterative, no dependencies) ── */

function fft1d(re: Float64Array, im: Float64Array, inverse: boolean) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const vr = re[b] * cr - im[b] * ci;
        const vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

function fft2d(re: Float64Array, im: Float64Array, n: number, inverse: boolean) {
  const rowR = new Float64Array(n);
  const rowI = new Float64Array(n);
  for (let y = 0; y < n; y++) {
    rowR.set(re.subarray(y * n, y * n + n));
    rowI.set(im.subarray(y * n, y * n + n));
    fft1d(rowR, rowI, inverse);
    re.set(rowR, y * n);
    im.set(rowI, y * n);
  }
  for (let x = 0; x < n; x++) {
    for (let y = 0; y < n; y++) {
      rowR[y] = re[y * n + x];
      rowI[y] = im[y * n + x];
    }
    fft1d(rowR, rowI, inverse);
    for (let y = 0; y < n; y++) {
      re[y * n + x] = rowR[y];
      im[y * n + x] = rowI[y];
    }
  }
}

/* ── Seeded spectrum -> texture ── */

interface SigilTexture {
  tex: Float32Array; // n*n in [0,1]
  mag: Float64Array; // the spectrum magnitude, reused by spectral imprint
  imagResidue: number; // max |imag| / max |real| after the inverse — should be ~0
}

/**
 * Builds F(u,v): radial bands x angular sectors with 1/f falloff; phase blends
 * seeded noise toward a structured spiral as coherence rises. Hermitian
 * symmetry is enforced so the inverse transform is real-valued.
 */
function buildTexture(seeds: number[], n: number, coherence: number): SigilTexture {
  const rBand = mulberry32(seeds[0]);
  const rAng = mulberry32(seeds[1]);
  const rPhase = mulberry32(seeds[2]);
  const rStruct = mulberry32(seeds[3]);
  const rShape = mulberry32(seeds[4]);

  const bandCount = 2 + Math.floor(rBand() * 4);
  const bands = Array.from({ length: bandCount }, () => ({
    r: 0.04 + rBand() * 0.4,
    w: 0.015 + rBand() * 0.09,
    g: 0.35 + rBand() * 0.65,
  }));
  const sectors = 1 + Math.floor(rAng() * 8);
  const rot = rAng() * Math.PI * 2;
  const sharp = 0.6 + rAng() * 3.2;
  const falloff = 0.7 + rShape() * 0.9;
  const spiralK = Math.floor(rStruct() * 7) - 3;
  const swirl = rStruct() * 3;

  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  const half = n / 2;

  for (let v = 0; v < n; v++) {
    for (let u = 0; u < n; u++) {
      const k = v * n + u;
      const mu = ((n - u) % n);
      const mv = ((n - v) % n);
      const km = mv * n + mu;
      if (km < k) continue; // mirror already filled

      // Centred frequency coordinates.
      const fu = u <= half ? u : u - n;
      const fv = v <= half ? v : v - n;
      const r = Math.sqrt(fu * fu + fv * fv) / half;
      const theta = Math.atan2(fv, fu);

      let radial = 0;
      for (const b of bands) {
        const d = (r - b.r) / b.w;
        radial += b.g * Math.exp(-d * d);
      }
      const angular = Math.pow(0.5 + 0.5 * Math.cos(sectors * theta + rot), sharp);
      const m = (radial * (0.3 + 0.7 * angular)) / (1 + Math.pow(r * 14, falloff));

      const randPh = rPhase() * Math.PI * 2;
      const structPh = spiralK * theta + r * swirl * Math.PI * 2;
      const ph = randPh * (1 - coherence) + structPh * coherence;

      re[k] = m * Math.cos(ph);
      im[k] = m * Math.sin(ph);
      if (km === k) {
        im[k] = 0; // self-conjugate points must be real
      } else {
        re[km] = re[k];
        im[km] = -im[k];
      }
    }
  }
  re[0] = 0; // zero DC: the texture should carry structure, not a brightness offset
  im[0] = 0;

  const mag = new Float64Array(n * n);
  for (let i = 0; i < mag.length; i++) mag[i] = Math.hypot(re[i], im[i]);

  fft2d(re, im, n, true);

  let maxR = 1e-12;
  let maxI = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < re.length; i++) {
    const a = Math.abs(re[i]);
    if (a > maxR) maxR = a;
    const b = Math.abs(im[i]);
    if (b > maxI) maxI = b;
    if (re[i] < lo) lo = re[i];
    if (re[i] > hi) hi = re[i];
  }
  const tex = new Float32Array(re.length);
  const span = Math.max(1e-12, hi - lo);
  for (let i = 0; i < re.length; i++) tex[i] = (re[i] - lo) / span;

  return { tex, mag, imagResidue: maxI / maxR };
}

// Textures are pure functions of (seeds, size, coherence); memoise the last few
// so slider drags and re-renders don't recompute a quarter-million-cell FFT.
const texCache = new Map<string, SigilTexture>();
function texture(seeds: number[], n: number, coherence: number): SigilTexture {
  const key = `${seeds.join(',')}:${n}:${coherence.toFixed(3)}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = buildTexture(seeds, n, coherence);
  texCache.set(key, t);
  if (texCache.size > 8) texCache.delete(texCache.keys().next().value!);
  return t;
}

/** Exposed for the verification harness; not used by the UI. */
export function sigilTextureFor(seeds: number[], n: number, coherence: number): SigilTexture {
  return texture(seeds, snapPow2(n), coherence);
}

function snapPow2(v: number): number {
  let s = 128;
  while (s * 2 <= 1024 && s * 2 <= v) s *= 2;
  return s;
}

function seedsOf(p: SigilParams): number[] {
  return [p.s0, p.s1, p.s2, p.s3, p.s4, p.s5, p.s6, p.s7].map((s) => s >>> 0);
}

/** A second, independent texture for the Y axis of displacement. */
function altSeeds(seeds: number[]): number[] {
  return seeds.map((_, i) => (seeds[(i + 4) % 8] ^ 0x9e3779b9) >>> 0);
}

function sampleWrap(tex: Float32Array, n: number, x: number, y: number): number {
  // Bilinear with wraparound, in texture space.
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = ((x0 % n) + n) % n;
  const ya = ((y0 % n) + n) % n;
  const xb = (xa + 1) % n;
  const yb = (ya + 1) % n;
  const a = tex[ya * n + xa];
  const b = tex[ya * n + xb];
  const c = tex[yb * n + xa];
  const d = tex[yb * n + xb];
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/* ── Apply ── */

export function applySigil(src: ImageData, p: SigilParams): ImageData {
  const { width: w, height: h, data } = src;
  const n = snapPow2(p.size);
  const coherence = Math.min(1, Math.max(0, p.coherence));
  const strength = Math.min(100, Math.max(0, p.strength)) / 100;
  const mode: SigilApply = p.applyMode;
  const T = texture(seedsOf(p), n, coherence);

  if (mode === 'blend') {
    // The texture itself, contrast scaled by strength; the step's own blend
    // and opacity do the compositing, same contract as field.
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      const ty = (y / h) * n;
      for (let x = 0; x < w; x++) {
        const t = sampleWrap(T.tex, n, (x / w) * n, ty);
        const v = (0.5 + (t - 0.5) * strength) * 255;
        const o = (y * w + x) * 4;
        out[o] = v;
        out[o + 1] = v;
        out[o + 2] = v;
        out[o + 3] = 255;
      }
    }
    return new ImageData(out, w, h);
  }

  // strength 0 is a true no-op for the input-reading modes, per house floors.
  if (strength === 0) return new ImageData(new Uint8ClampedArray(data), w, h);

  if (mode === 'displace') {
    const T2 = texture(altSeeds(seedsOf(p)), n, coherence);
    // Amplitude rides the canvas size, so preview and export tear identically.
    const amp = strength * 0.12 * Math.min(w, h);
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      const ty = (y / h) * n;
      for (let x = 0; x < w; x++) {
        const tx = (x / w) * n;
        const dx = (sampleWrap(T.tex, n, tx, ty) - 0.5) * 2 * amp;
        const dy = (sampleWrap(T2.tex, n, tx, ty) - 0.5) * 2 * amp;
        const sx = ((Math.round(x + dx) % w) + w) % w;
        const sy = ((Math.round(y + dy) % h) + h) % h;
        const so = (sy * w + sx) * 4;
        const o = (y * w + x) * 4;
        out[o] = data[so];
        out[o + 1] = data[so + 1];
        out[o + 2] = data[so + 2];
        out[o + 3] = data[so + 3];
      }
    }
    return new ImageData(out, w, h);
  }

  if (mode === 'mask') {
    // Gate the image through the texture: dark texture swallows the picture.
    const out = new Uint8ClampedArray(data.length);
    for (let y = 0; y < h; y++) {
      const ty = (y / h) * n;
      for (let x = 0; x < w; x++) {
        const t = sampleWrap(T.tex, n, (x / w) * n, ty);
        const e = Math.min(1, Math.max(0, (t - 0.35) / 0.3)); // smooth gate 0.35..0.65
        const gate = e * e * (3 - 2 * e);
        const k = 1 - strength * (1 - gate);
        const o = (y * w + x) * 4;
        out[o] = data[o] * k;
        out[o + 1] = data[o + 1] * k;
        out[o + 2] = data[o + 2] * k;
        out[o + 3] = data[o + 3];
      }
    }
    return new ImageData(out, w, h);
  }

  return spectralImprint(src, T, n, strength);
}

/**
 * Multiply the image's own FFT magnitude by the sigil's spectrum (keeping the
 * image's phase) and inverse-transform. Runs on luma at the sigil's FFT size,
 * then rescales each pixel's RGB by the luma ratio — one forward and one
 * inverse 2D FFT instead of six.
 */
function spectralImprint(src: ImageData, T: SigilTexture, n: number, strength: number): ImageData {
  const { width: w, height: h, data } = src;

  // Luma, resampled to the FFT grid.
  const re = new Float64Array(n * n);
  const im = new Float64Array(n * n);
  for (let y = 0; y < n; y++) {
    const sy = Math.min(h - 1, Math.floor((y / n) * h));
    for (let x = 0; x < n; x++) {
      const sx = Math.min(w - 1, Math.floor((x / n) * w));
      const o = (sy * w + sx) * 4;
      re[y * n + x] = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
    }
  }
  let inMean = 0;
  for (let i = 0; i < re.length; i++) inMean += re[i];
  inMean /= re.length;

  fft2d(re, im, n, false);

  // Normalise the sigil magnitude to mean 1 so strength, not the sigil's own
  // energy, decides how hard the imprint bites.
  let magMean = 0;
  for (let i = 0; i < T.mag.length; i++) magMean += T.mag[i];
  magMean = Math.max(1e-12, magMean / T.mag.length);
  const k = strength * 1.5;
  for (let i = 1; i < re.length; i++) {
    const f = Math.pow(T.mag[i] / magMean + 1e-6, k);
    re[i] *= f;
    im[i] *= f;
  }

  fft2d(re, im, n, true);

  // Pull the mean back to the input's so the imprint shapes rather than dims.
  let outMean = 0;
  for (let i = 0; i < re.length; i++) outMean += re[i];
  outMean /= re.length;
  const lift = inMean - outMean;

  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    const ty = Math.min(n - 1, Math.floor((y / h) * n));
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const luma = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      const target = re[ty * n + Math.min(n - 1, Math.floor((x / w) * n))] + lift;
      const ratio = luma > 1 ? Math.max(0, target) / luma : Math.max(0, target) / 255;
      out[o] = data[o] * ratio;
      out[o + 1] = data[o + 1] * ratio;
      out[o + 2] = data[o + 2] * ratio;
      out[o + 3] = data[o + 3];
    }
  }
  return new ImageData(out, w, h);
}
