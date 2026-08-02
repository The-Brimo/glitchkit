import type { PixelSortParams, SortKey } from '../types';

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// All keys are normalised to 0..255 so the low/high thresholds mean the same thing
// regardless of which property drives the sort.
function sortKeyValue(r: number, g: number, b: number, key: SortKey): number {
  switch (key) {
    case 'red':
      return r;
    case 'green':
      return g;
    case 'blue':
      return b;
    case 'hue': {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const d = max - min;
      if (d === 0) return 0;
      let h: number;
      if (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      return (h / 6) * 255;
    }
    case 'saturation': {
      const max = Math.max(r, g, b);
      if (max === 0) return 0;
      return ((max - Math.min(r, g, b)) / max) * 255;
    }
    default:
      return luminance(r, g, b);
  }
}

export function pixelSort(src: ImageData, params: PixelSortParams): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data);
  const vertical = params.direction === 'vertical';
  const lineCount = vertical ? width : height;
  const lineLen = vertical ? height : width;
  const key = params.sortBy ?? 'brightness';
  const descending = params.order === 'descending';
  // The thresholds are a band and the UI lets them be dragged past each other,
  // which previously made every span test fail — a silent total no-op. Treat
  // the pair as unordered.
  const lo = Math.min(params.low, params.high);
  const hi = Math.max(params.low, params.high);

  const idx = (line: number, pos: number) => {
    const x = vertical ? line : pos;
    const y = vertical ? pos : line;
    return (y * width + x) * 4;
  };

  for (let line = 0; line < lineCount; line++) {
    let spanStart = -1;
    for (let pos = 0; pos <= lineLen; pos++) {
      const inSpan = pos < lineLen;
      let inRange = false;
      if (inSpan) {
        const o = idx(line, pos);
        const k = sortKeyValue(data[o], data[o + 1], data[o + 2], key);
        inRange = k >= lo && k <= hi;
      }
      if (inRange) {
        if (spanStart === -1) spanStart = pos;
      } else if (spanStart !== -1) {
        sortSpan(data, out, idx, line, spanStart, pos - 1, key, descending);
        spanStart = -1;
      }
    }
  }

  return new ImageData(out, width, height);
}

function sortSpan(
  data: Uint8ClampedArray,
  out: Uint8ClampedArray,
  idx: (line: number, pos: number) => number,
  line: number,
  start: number,
  end: number,
  key: SortKey,
  descending: boolean
) {
  const len = end - start + 1;
  if (len <= 1) return;
  const pixels: { r: number; g: number; b: number; a: number; k: number }[] = new Array(len);
  for (let i = 0; i < len; i++) {
    const o = idx(line, start + i);
    const r = data[o];
    const g = data[o + 1];
    const b = data[o + 2];
    pixels[i] = { r, g, b, a: data[o + 3], k: sortKeyValue(r, g, b, key) };
  }
  pixels.sort(descending ? (a, b) => b.k - a.k : (a, b) => a.k - b.k);
  for (let i = 0; i < len; i++) {
    const o = idx(line, start + i);
    out[o] = pixels[i].r;
    out[o + 1] = pixels[i].g;
    out[o + 2] = pixels[i].b;
    out[o + 3] = pixels[i].a;
  }
}
