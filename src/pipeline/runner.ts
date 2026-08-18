import type { Document, FeedbackParams, FieldParams, GlyphParams, ScanParams, Step } from '../types';
import { generateNoiseField } from './noise';
import { generateReactionField } from './reaction';
import { fieldToImageData } from './palette';
import { pixelSort } from './pixelSort';
import { channelShift } from './channelShift';
import { displace } from './displace';
import { sliceShuffle } from './sliceShuffle';
import { halftone } from './halftone';
import { feedback } from './feedback';
import { scanMask } from './scan';
import { glyphSpill } from './glyphs';
import { contourTrace } from './contour';
import { jpegLoop } from './jpegLoop';
import { applyDatabend } from './databend';
import { applyByteOps } from './byteOps';
import { applyAudioLab } from './audioLab';
import { canvasFromImageData, imageDataFromCanvas, compositeOver } from './composite';
import { canvasToJpegBytes, jpegBytesToImageData, findScanDataStart, findScanDataEnd, sanitizeScanRegion } from './jpegBytes';

function fitDims(width: number, height: number, maxDim: number): { width: number; height: number } {
  if (Math.max(width, height) <= maxDim) return { width, height };
  const scale = maxDim / Math.max(width, height);
  return { width: Math.max(8, Math.round(width * scale)), height: Math.max(8, Math.round(height * scale)) };
}

let imageCache: { url: string; img: HTMLImageElement } | null = null;
async function loadImage(url: string): Promise<HTMLImageElement> {
  if (imageCache && imageCache.url === url) return imageCache.img;
  const img = new Image();
  img.src = url;
  await img.decode();
  imageCache = { url, img };
  return img;
}

function drawCover(img: CanvasImageSource, sw: number, sh: number, width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  const scale = Math.max(width / sw, height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
  return c;
}

export interface RunOptions {
  quality: 'preview' | 'full';
  maxPreviewDim?: number;
  onProgress?: (fraction: number, label: string) => void;
}

export interface RunResult {
  canvas: HTMLCanvasElement;
  recipeLabel: string;
  stepErrors: Record<string, string>;
  hasImage: boolean;
  needsImage: boolean;
}

export async function generateSourceCanvas(doc: Document, opts: RunOptions): Promise<HTMLCanvasElement | null> {
  if (doc.sourceMode === 'imported') {
    if (!doc.imageDataURL) return null;
    const img = await loadImage(doc.imageDataURL);
    const target =
      opts.quality === 'preview' ? fitDims(img.naturalWidth, img.naturalHeight, opts.maxPreviewDim ?? 900) : { width: img.naturalWidth, height: img.naturalHeight };
    return drawCover(img, img.naturalWidth, img.naturalHeight, target.width, target.height);
  }

  const full = { width: doc.width, height: doc.height };
  const target = opts.quality === 'preview' ? fitDims(full.width, full.height, opts.maxPreviewDim ?? 900) : full;

  let field: Float32Array;
  if (doc.generator === 'noise') {
    field = generateNoiseField({
      seed: doc.seed,
      width: target.width,
      height: target.height,
      octaves: doc.noise.octaves,
      freq: doc.noise.freq,
      warp: doc.noise.warp,
    });
  } else {
    const steps = opts.quality === 'preview' ? Math.min(doc.reaction.steps, 800) : doc.reaction.steps;
    const sim = opts.quality === 'preview' ? Math.min(doc.reaction.sim, 120) : doc.reaction.sim;
    field = await generateReactionField({
      seed: doc.seed,
      width: target.width,
      height: target.height,
      preset: doc.reaction.preset,
      steps,
      sim,
      onProgress: (f) => opts.onProgress?.(f, 'generating'),
    });
  }

  const imageData = fieldToImageData(field, target.width, target.height, doc.palette, doc.gamma, doc.invert);
  return canvasFromImageData(imageData);
}

async function runTransform(
  input: HTMLCanvasElement,
  step: Step,
  opts: RunOptions,
  renderScale: number,
  onStepProgress?: (fraction: number) => void
): Promise<{ canvas: HTMLCanvasElement; error?: string }> {
  try {
    if (step.type === 'scan') {
      // Also input-independent: returns the screen, not the picture behind it.
      const out = scanMask(input.width, input.height, step.params as ScanParams, renderScale);
      return { canvas: canvasFromImageData(out) };
    }

    // The one step that reads nothing from its input but its dimensions: it
    // synthesises a field, and runPipeline's existing compositeOver blends it
    // in. Nothing in this contract requires a step to use what it was handed.
    if (step.type === 'field') {
      const p = step.params as FieldParams;
      const { width, height } = input;
      let field: Float32Array;
      if (p.generator === 'reaction') {
        // Same preview clamps as the source path — the sim cost is steps x sim^2
        // and is unrelated to canvas size, so an unclamped field step would stall
        // every debounced preview render.
        const steps = opts.quality === 'preview' ? Math.min(p.steps, 800) : p.steps;
        const sim = opts.quality === 'preview' ? Math.min(p.sim, 120) : p.sim;
        field = await generateReactionField({
          seed: p.seed,
          width,
          height,
          preset: p.preset,
          steps,
          sim,
          onProgress: onStepProgress,
        });
      } else {
        field = generateNoiseField({
          seed: p.seed,
          width,
          height,
          octaves: p.octaves,
          freq: p.freq,
          warp: p.warp,
        });
      }
      const out = fieldToImageData(field, width, height, p.palette, p.gamma, p.invert);
      return { canvas: canvasFromImageData(out) };
    }

    if (step.type === 'pixelsort') {
      const out = pixelSort(imageDataFromCanvas(input), step.params as any);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'channelshift') {
      const out = channelShift(imageDataFromCanvas(input), step.params as any);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'displace') {
      const out = displace(imageDataFromCanvas(input), step.params as any, 7);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'sliceshuffle') {
      const out = sliceShuffle(imageDataFromCanvas(input), step.params as any);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'contour') {
      // Pixel-domain analysis; weight and smooth are in final-render pixels.
      const out = contourTrace(imageDataFromCanvas(input), step.params as any, renderScale);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'glyphs') {
      // Canvas-domain: text rendering. Cell size is in final-render pixels.
      return { canvas: glyphSpill(input, step.params as GlyphParams, renderScale) };
    }
    if (step.type === 'feedback') {
      // Operates on canvases, not ImageData — the accumulation is compositing.
      return { canvas: feedback(input, step.params as FeedbackParams) };
    }
    if (step.type === 'halftone') {
      // Cell size is authored in final-render pixels, same contract as scan's pitch.
      const out = halftone(imageDataFromCanvas(input), step.params as any, renderScale);
      return { canvas: canvasFromImageData(out) };
    }
    if (step.type === 'jpegloop') {
      return { canvas: await jpegLoop(input, step.params as any) };
    }

    if (step.type === 'audiolab') {
      // Audio Lab runs on the raw pixel bytes (the design's "headerless PCM"), not the
      // JPEG stream — DSP on entropy-coded bytes just desyncs the decoder and yields the
      // same macroblock noise regardless of source. On pixel bytes, position maps to
      // pixel position, so the effects stay visibly correlated with the image.
      const img = imageDataFromCanvas(input);
      const { width, height, data: rgba } = img;
      const rgb = new Uint8Array(width * height * 3);
      for (let p = 0, q = 0; q < rgb.length; p += 4, q += 3) {
        rgb[q] = rgba[p];
        rgb[q + 1] = rgba[p + 1];
        rgb[q + 2] = rgba[p + 2];
      }
      const rowStride = Math.max(1, Math.floor((width * 3) / 2)); // 16-bit samples per row
      // Run the effect full-wet and crossfade per byte (per channel) here instead of in
      // int16 sample space — arithmetic on packed byte pairs scrambles the low-order
      // byte with carry noise, so a sample-space mix never actually cleans up.
      const params = step.params as any;
      const processed = applyAudioLab(rgb, 0, rgb.length, { ...params, mix: 100 }, rowStride);
      const mix = Math.min(100, Math.max(0, params.mix)) / 100;
      const out = rgb.slice();
      const bodyLen = Math.min(processed.length, out.length);
      for (let i = 0; i < bodyLen; i++) {
        out[i] = Math.round(out[i] + (processed[i] - out[i]) * mix);
      }
      // With "Lock byte length" off, effect tails run past the end of the buffer; fold
      // them back onto the top of the image instead of discarding them.
      for (let i = out.length; i < processed.length && i - out.length < out.length; i++) {
        const j = i - out.length;
        out[j] = Math.round(out[j] + (processed[i] - out[j]) * mix * 0.5);
      }
      const outData = new Uint8ClampedArray(rgba.length);
      for (let p = 0, q = 0; q < out.length; p += 4, q += 3) {
        outData[p] = out[q];
        outData[p + 1] = out[q + 1];
        outData[p + 2] = out[q + 2];
        outData[p + 3] = 255;
      }
      return { canvas: canvasFromImageData(new ImageData(outData, width, height)) };
    }

    // Byte-domain: encode -> mutate scan data (header preserved) -> decode.
    const bytes = await canvasToJpegBytes(input);
    const start = findScanDataStart(bytes);
    const end = findScanDataEnd(bytes);
    const mutated =
      step.type === 'databend'
        ? applyDatabend(bytes, start, end, step.params as any)
        : applyByteOps(bytes, start, end, step.params as any);
    sanitizeScanRegion(mutated, start, end);
    const imageData = await jpegBytesToImageData(mutated);
    return { canvas: canvasFromImageData(imageData) };
  } catch {
    return { canvas: input, error: 'bend produced an unreadable file, try a lower amount' };
  }
}

export async function runPipeline(doc: Document, opts: RunOptions): Promise<RunResult> {
  const needsImage = doc.sourceMode === 'imported' && !doc.imageDataURL;
  const stepErrors: Record<string, string> = {};

  let canvas = needsImage ? null : await generateSourceCanvas(doc, opts);

  // Steps whose parameters are authored in final-render pixels (the scan mask's
  // pitch) need to know how much the preview shrank, or the live preview shows a
  // visibly coarser pattern than the exported image. Measured on halftone, whose
  // cell size has this same latent mismatch: a 900px preview of a 1600px document
  // renders the pattern 1.78x coarser relative to the frame.
  let renderScale = 1;
  if (canvas && opts.quality === 'preview') {
    let fullWidth = doc.width;
    if (doc.sourceMode === 'imported' && doc.imageDataURL) {
      fullWidth = (await loadImage(doc.imageDataURL)).naturalWidth;
    }
    if (fullWidth > 0) renderScale = canvas.width / fullWidth;
  }

  if (canvas) {
    const enabledCount = doc.chain.filter((s) => s.enabled).length;
    let i = 0;
    for (const step of doc.chain) {
      if (!step.enabled) continue;
      opts.onProgress?.(i / Math.max(1, enabledCount), `rendering ${step.type}`);
      const input = canvas;
      const stepIndex = i;
      const { canvas: transformed, error } = await runTransform(input, step, opts, renderScale, (f) =>
        opts.onProgress?.((stepIndex + f) / Math.max(1, enabledCount), `rendering ${step.type}`)
      );
      if (error) stepErrors[step.id] = error;
      canvas = compositeOver(input, transformed, step.blend, step.opacity);
      i++;
    }
  }

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
  }

  const enabledCount = doc.chain.filter((s) => s.enabled).length;
  const recipeLabel =
    doc.sourceMode === 'imported'
      ? `${doc.imageName || 'no image'} · imported · ${enabledCount} transform(s)`
      : `${doc.generator} · seed ${doc.seed} · ${doc.palette} · ${doc.width}x${doc.height} · ${enabledCount} transform(s)`;

  return { canvas, recipeLabel, stepErrors, hasImage: doc.sourceMode === 'imported' && !!doc.imageDataURL, needsImage };
}
