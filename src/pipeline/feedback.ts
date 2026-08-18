import type { FeedbackParams, EchoBlend } from '../types';

const ECHO_COMPOSITE: Record<EchoBlend, GlobalCompositeOperation> = {
  normal: 'source-over',
  screen: 'screen',
  lighten: 'lighten',
  difference: 'difference',
};

// Below 1/255 a copy cannot change any 8-bit channel, so it is pure cost.
const INVISIBLE = 1 / 255;

/**
 * Video-feedback / droste accumulation: the image drawn over itself N times,
 * each copy carrying one more application of the same small affine step and
 * one more application of the trail falloff.
 *
 * Unlike the rest of the pipeline this is a compositing effect rather than a
 * pixel-math one — canvas2d does the resampling, which is why it stays cheap
 * at full resolution even at 24 iterations.
 */
export function feedback(input: HTMLCanvasElement, p: FeedbackParams): HTMLCanvasElement {
  const { width, height } = input;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const ctx = out.getContext('2d')!;

  // The un-transformed image is always the base; echoes accumulate on top.
  ctx.drawImage(input, 0, 0);

  const iterations = Math.max(0, Math.round(p.iterations));
  if (iterations === 0) return out; // amount-style floor: 0 is a true no-op

  let { zoom, rotate, dx, dy } = p;
  // With every motion param at zero each copy lands exactly on the original and
  // the step silently does nothing (or merely brightens, under screen/lighten).
  // Same stance as sliceShuffle's >=2 slices: a nonzero iteration count must
  // produce a visible result, so fall back to the smallest zoom the slider can
  // express rather than rendering a no-op.
  if (zoom === 0 && rotate === 0 && dx === 0 && dy === 0) zoom = 1;

  // Trail falloff, as a curve over the echo's POSITION IN THE TRAIL rather than
  // a fixed per-echo multiplier. A plain retention^i fades out after a set
  // number of copies no matter how many were asked for, which measured as a
  // hard dead zone: at decay 35 the result stopped changing past 8 echoes
  // (mean abs delta 77.3 at 8, 78.0 at both 16 and 24) while the slider ran to
  // 24. Normalising the ramp to `iterations` keeps every requested copy
  // visible, so the two sliders stay independent: iterations sets how many
  // copies, decay sets how fast the trail collapses across them.
  const decay = Math.min(100, Math.max(0, p.decay));
  const gamma = decay <= 50 ? 0.15 + (1 - 0.15) * (decay / 50) : 1 + 3 * ((decay - 50) / 50);

  ctx.globalCompositeOperation = ECHO_COMPOSITE[p.echoBlend] ?? 'source-over';

  const cx = width / 2;
  const cy = height / 2;
  const radiansPerStep = (rotate * Math.PI) / 180;
  const scalePerStep = 1 + zoom / 100;

  for (let i = 1; i <= iterations; i++) {
    const alpha = Math.pow(1 - i / (iterations + 1), gamma);
    if (alpha < INVISIBLE) break;

    ctx.globalAlpha = alpha;
    ctx.save();
    // Compound the step i times: zoom and rotation about the centre, drift added
    // linearly so dx/dy read as a constant per-echo offset.
    ctx.translate(cx + dx * i, cy + dy * i);
    ctx.rotate(radiansPerStep * i);
    const s = Math.pow(scalePerStep, i);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
    ctx.drawImage(input, 0, 0);
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return out;
}
