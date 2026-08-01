import type { BlendMode } from '../types';

const BLEND_TO_COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  screen: 'screen',
  multiply: 'multiply',
  overlay: 'overlay',
  difference: 'difference',
  lighten: 'lighten',
  darken: 'darken',
};

export function canvasFromImageData(data: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = data.width;
  c.height = data.height;
  c.getContext('2d')!.putImageData(data, 0, 0);
  return c;
}

export function imageDataFromCanvas(c: HTMLCanvasElement): ImageData {
  return c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
}

// Composites `overlay` (the transform's output) back over `base` (its input),
// per the design's per-step blend mode + opacity.
export function compositeOver(
  base: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  blend: BlendMode,
  opacityPercent: number
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = base.width;
  out.height = base.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(base, 0, 0);
  ctx.globalAlpha = Math.min(1, Math.max(0, opacityPercent / 100));
  ctx.globalCompositeOperation = BLEND_TO_COMPOSITE[blend];
  ctx.drawImage(overlay, 0, 0, out.width, out.height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return out;
}
