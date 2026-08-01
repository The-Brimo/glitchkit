import type { HalftoneParams } from '../types';

// 4x4 Bayer matrix, values 0..15.
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function halftone(src: ImageData, params: HalftoneParams): ImageData {
  const levels = Math.max(2, Math.min(8, Math.round(params.levels)));
  const scale = Math.max(2, Math.min(12, Math.round(params.scale)));
  if (params.mode === 'diffusion') return floydSteinberg(src, levels);
  if (params.mode === 'dots') return dotScreen(src, scale);
  return bayer(src, levels, scale);
}

function bayer(src: ImageData, levels: number, scale: number): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const step = 255 / (levels - 1);

  for (let y = 0; y < height; y++) {
    const by = Math.floor(y / scale) % 4;
    for (let x = 0; x < width; x++) {
      const bx = Math.floor(x / scale) % 4;
      const threshold = ((BAYER4[by][bx] + 0.5) / 16 - 0.5) * step;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round((data[o + c] + threshold) / step) * step;
      }
      out[o + 3] = data[o + 3];
    }
  }
  return new ImageData(out, width, height);
}

function floydSteinberg(src: ImageData, levels: number): ImageData {
  const { width, height, data } = src;
  const step = 255 / (levels - 1);
  // Error diffusion needs float precision per channel.
  const buf = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; j < buf.length; i += 4, j += 3) {
    buf[j] = data[i];
    buf[j + 1] = data[i + 1];
    buf[j + 2] = data[i + 2];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c++) {
        const old = buf[o + c];
        const q = Math.max(0, Math.min(255, Math.round(old / step) * step));
        buf[o + c] = q;
        const err = old - q;
        if (x + 1 < width) buf[o + 3 + c] += (err * 7) / 16;
        if (y + 1 < height) {
          const below = ((y + 1) * width + x) * 3;
          if (x > 0) buf[below - 3 + c] += (err * 3) / 16;
          buf[below + c] += (err * 5) / 16;
          if (x + 1 < width) buf[below + 3 + c] += (err * 1) / 16;
        }
      }
    }
  }

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0, j = 0; j < buf.length; i += 4, j += 3) {
    out[i] = buf[j];
    out[i + 1] = buf[j + 1];
    out[i + 2] = buf[j + 2];
    out[i + 3] = data[i + 3];
  }
  return new ImageData(out, width, height);
}

function dotScreen(src: ImageData, scale: number): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  const cell = scale * 2;

  for (let cy = 0; cy < height; cy += cell) {
    for (let cx = 0; cx < width; cx += cell) {
      const cw = Math.min(cell, width - cx);
      const ch = Math.min(cell, height - cy);
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const o = ((cy + y) * width + (cx + x)) * 4;
          r += data[o];
          g += data[o + 1];
          b += data[o + 2];
        }
      }
      const n = cw * ch;
      r /= n;
      g /= n;
      b /= n;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      // Dot area proportional to brightness -> radius follows sqrt.
      const radius = Math.sqrt(lum / 255) * (cell / 2) * 1.15;
      const midX = cw / 2;
      const midY = ch / 2;
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const o = ((cy + y) * width + (cx + x)) * 4;
          const dx = x + 0.5 - midX;
          const dy = y + 0.5 - midY;
          const inside = dx * dx + dy * dy <= radius * radius;
          out[o] = inside ? r : 8;
          out[o + 1] = inside ? g : 8;
          out[o + 2] = inside ? b : 10;
          out[o + 3] = data[o + 3];
        }
      }
    }
  }
  return new ImageData(out, width, height);
}
