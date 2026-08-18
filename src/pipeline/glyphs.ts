import { hash2, seedFromInt } from './rng';
import type { GlyphParams, GlyphCharset, GlyphInk } from '../types';

/**
 * Two families, split by where tone comes from:
 *
 * DENSITY sets (blocks, ascii) carry tone in ink coverage, so the ramp must be
 * coverage-monotone glyph by glyph. Conventional orderings are not: measured
 * on the actual platform font, '=' carries more ink than '+', which inverted
 * tone across any image whose luma sits in that band (the pipeline test image
 * measured r = -0.34 against its input). The ramp is therefore SORTED by
 * measured coverage at runtime rather than trusted.
 *
 * DATA sets (hex, binary) cannot be reordered — the glyph is the data. hex
 * prints the high nibble of the cell's luma (0x00-0xFF -> 0-F), a literal
 * hexdump of the image; binary thresholds it. Their coverage is arbitrary
 * ('0' is fatter than '1', which measured r = -0.66 on a midrange image
 * because every cell straddles the boundary), so each glyph's ink is dimmed
 * by measured minCoverage/coverage: equal luma prints equal apparent ink no
 * matter which character lands there, and tone rides the ink level alone.
 */
const CHARSETS: Record<GlyphCharset, string[]> = {
  hex: '0123456789ABCDEF'.split(''),
  blocks: [' ', '\u2591', '\u2592', '\u2593', '\u2588'],
  ascii: [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'],
  binary: ['0', '1'],
};

const DENSITY_SETS: GlyphCharset[] = ['blocks', 'ascii'];

const FONT_STACK = 'ui-monospace, Menlo, Consolas, monospace';

/**
 * Fraction of a cell each glyph actually inks, measured by drawing it once on
 * an offscreen canvas and summing alpha. Font-rendering-accurate for whatever
 * font the platform resolves, which is exactly why the orderings above cannot
 * be hardcoded.
 *
 * Measured AT THE RENDERED SIZE, not a fixed reference size: antialiasing
 * shifts the ratios between glyphs as the font shrinks, enough that factors
 * derived at 32px left an 18% apparent-ink step between '7' and '8' at a
 * 12px cell — which inverted tone across any image whose luma straddles the
 * 0x7F boundary, i.e. most midrange images. The canvas is 3x the cell so
 * glyphs that overflow their cell (they all do; the font is bigger than the
 * cell) still have their ink counted, as it lands in neighbouring cells in a
 * real render rather than vanishing. Cached per charset+scale+size.
 */
const coverageCache = new Map<string, number[]>();
function inkCoverage(charset: GlyphCharset, fontScale: number, cellPx: number): number[] {
  const size = Math.max(2, Math.round(cellPx));
  const key = `${charset}:${fontScale}:${size}`;
  const hit = coverageCache.get(key);
  if (hit) return hit;

  const S = size * 3;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const x = c.getContext('2d')!;
  x.font = `${(size * fontScale).toFixed(2)}px ${FONT_STACK}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = '#fff';

  const cov = CHARSETS[charset].map((ch) => {
    x.clearRect(0, 0, S, S);
    x.fillText(ch, S / 2, S / 2);
    const d = x.getImageData(0, 0, S, S).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) ink += d[i];
    return ink / (size * size * 255);
  });
  coverageCache.set(key, cov);
  return cov;
}

const INKS: Record<Exclude<GlyphInk, 'sample'>, [number, number, number]> = {
  green: [64, 255, 128],
  amber: [255, 176, 0],
  white: [235, 235, 242],
};

/**
 * Font size relative to the cell. Monospace advance width is ~0.6em, so at 1em
 * per cell the block elements tile with visible gutters and the grid reads as
 * a mesh instead of a screen. 1.7 was tuned by measuring full-white coverage:
 * a white input through the blocks set should come back near-white.
 */
const BLOCK_FONT = 1.7;
const TEXT_FONT = 1.2;

/**
 * Re-renders the image as a grid of terminal glyphs — a hexdump, a shading
 * ramp, or binary — chosen per cell from the cell's mean luma. Unlike field
 * and scan this additive step READS its input: the marks are new, but they are
 * placed and coloured by the picture, so at normal/100 it is a legible remap
 * (ASCII-art) rather than a replacement.
 *
 * `scramble` corrupts a seeded fraction of cells with the wrong glyph from the
 * same set — the terminal-datamosh look — without touching ink, so tone
 * survives even at 100.
 *
 * `cell` is authored in final-render pixels and multiplied by `renderScale`,
 * per the preview-fidelity contract scan and halftone follow.
 */
export function glyphSpill(input: HTMLCanvasElement, p: GlyphParams, renderScale: number): HTMLCanvasElement {
  const { width, height } = input;
  const cell = Math.max(2, p.cell * renderScale);
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);

  const src = input.getContext('2d')!.getImageData(0, 0, width, height).data;
  const scramble = Math.min(100, Math.max(0, p.scramble)) / 100;
  const seed = seedFromInt(p.seed);
  const inkConst = p.ink === 'sample' ? null : INKS[p.ink];

  const fontScale = p.charset === 'blocks' ? BLOCK_FONT : TEXT_FONT;
  const coverage = inkCoverage(p.charset, fontScale, cell);
  let chars: string[];
  let inkFactor: number[] | null;
  if (DENSITY_SETS.includes(p.charset)) {
    chars = CHARSETS[p.charset]
      .map((ch, i) => ({ ch, cov: coverage[i] }))
      .sort((a, b) => a.cov - b.cov)
      .map((o) => o.ch);
    inkFactor = null;
  } else {
    chars = CHARSETS[p.charset];
    const covMin = Math.min(...coverage.filter((c) => c > 0));
    inkFactor = coverage.map((c) => (c > 0 ? covMin / c : 1));
  }

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `${(cell * fontScale).toFixed(2)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let cy = 0; cy < rows; cy++) {
    const y0 = Math.floor(cy * cell);
    const y1 = Math.min(height, Math.floor((cy + 1) * cell));
    for (let cx = 0; cx < cols; cx++) {
      const x0 = Math.floor(cx * cell);
      const x1 = Math.min(width, Math.floor((cx + 1) * cell));

      // Mean cell colour, same approach as halftone's dot screen.
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * width + x) * 4;
          r += src[o];
          g += src[o + 1];
          b += src[o + 2];
          n++;
        }
      }
      if (n === 0) continue;
      r /= n;
      g /= n;
      b /= n;

      let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (p.invert) luma = 255 - luma;

      let idx = Math.min(chars.length - 1, Math.floor((luma / 256) * chars.length));
      if (scramble > 0 && hash2(cx, cy, seed) < scramble) {
        idx = Math.floor(hash2(cx, cy, seed ^ 0x9e3779b9) * chars.length);
      }
      const glyph = chars[idx];
      if (glyph === ' ') continue;

      // Data sets: dim fat glyphs so apparent ink tracks luma, not the shape
      // of whichever character the data happened to be.
      const factor = inkFactor ? inkFactor[idx] : 1;

      // Constant inks keep a brightness floor so dark regions still read as a
      // lit terminal rather than vanishing. Data sets get a lower floor: with
      // coverage compensated away, ink level is their ONLY tone carrier, and
      // 0.35 compressed it enough that a low-contrast image came out nearly
      // flat (r = 0.09). Density sets keep 0.35 — their tone lives in coverage.
      if (inkConst) {
        const floor = inkFactor ? 0.12 : 0.35;
        const level = (floor + (1 - floor) * (luma / 255)) * factor;
        ctx.fillStyle = `rgb(${Math.round(inkConst[0] * level)},${Math.round(inkConst[1] * level)},${Math.round(inkConst[2] * level)})`;
      } else {
        ctx.fillStyle = `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`;
      }
      ctx.fillText(glyph, (x0 + x1) / 2, (y0 + y1) / 2);
    }
  }
  return out;
}
