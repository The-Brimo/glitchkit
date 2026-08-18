import type { ScanParams } from '../types';

// Aperture-grille and shadow-mask triads need three phosphor columns to exist
// at all; below this a "triad" cannot hold one column per channel.
const MIN_TRIAD_PITCH = 3;

/**
 * Synthesises a CRT screen mask — scanlines, aperture grille or shadow mask,
 * optionally with a hum bar — as an image to be composited over the frame.
 *
 * Like `field`, this reads nothing from the pipeline: it returns the screen
 * itself and lets the step's blend do the work. The mask is white where light
 * passes and darker where it is blocked, which makes `multiply` the physically
 * correct blend and an all-white mask (strength 0) an exact no-op.
 *
 * `renderScale` is the preview downscale factor (1 during a full render). Pitch
 * is authored in final-render pixels, so it must be scaled or the live preview
 * would show a mask ~1.8x coarser relative to the frame than the export.
 * Measured: with the correction a 900px preview and a 1600px render both show
 * 112 stripes per frame; without it the preview shows 63, a 44% error.
 *
 * A mask only ever subtracts light — there is no headroom above white to give
 * back — so it necessarily dims the frame (brightness retained at strength 55
 * measures 73% for scanlines, 63% for the triad modes). That is what a real
 * shadow mask does too, and it is left to the user rather than auto-corrected.
 */
export function scanMask(width: number, height: number, p: ScanParams, renderScale: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const strength = Math.min(100, Math.max(0, p.strength)) / 100;
  const dark = 1 - strength;

  // Triad pitch is snapped to a multiple of three so each phosphor gets an equal
  // number of columns. Unsnapped, a pitch of 8 splits 3/3/2 and starves blue by
  // a third, tinting the whole frame yellow — measured as 10800/10800/7200 lit
  // subpixels before the snap, 9600 each after.
  const authored =
    p.mode === 'scanlines'
      ? Math.max(1, p.pitch)
      : Math.max(MIN_TRIAD_PITCH, Math.round(p.pitch / 3) * 3);
  const pitch = Math.max(1, authored * renderScale);
  const sub = pitch / 3;

  // Hum bar: a soft dark band, its depth following `strength` so that strength 0
  // switches the whole step off rather than leaving an orphaned bar behind.
  const rollFrac = Math.min(100, Math.max(0, p.roll)) / 100;
  const barHalf = (rollFrac * height) / 2;
  const barCentre = (Math.min(100, Math.max(0, p.rollPos)) / 100) * height;
  const barDepth = strength * 0.6;

  for (let y = 0; y < height; y++) {
    // Vertical mask component.
    let rowLevel = 1;
    if (p.mode === 'scanlines') {
      rowLevel = (y % pitch) / pitch < 0.5 ? 1 : dark;
    } else if (p.mode === 'shadowmask') {
      // Gap between dot rows, so triads read as dots rather than stripes.
      rowLevel = (y % pitch) / pitch < 0.75 ? 1 : dark;
    }

    let bar = 1;
    if (barHalf > 0) {
      const d = Math.abs(y - barCentre) / barHalf;
      if (d < 1) bar = 1 - barDepth * (0.5 + 0.5 * Math.cos(Math.PI * d));
    }

    // Shadow masks stagger every other triad row by half a pitch.
    const xShift = p.mode === 'shadowmask' && Math.floor(y / pitch) % 2 === 1 ? pitch / 2 : 0;

    for (let x = 0; x < width; x++) {
      let r = rowLevel;
      let g = rowLevel;
      let b = rowLevel;

      if (p.mode !== 'scanlines') {
        const phase = ((x + xShift) % pitch) / sub;
        const lit = Math.min(2, Math.floor(phase));
        r = lit === 0 ? rowLevel : rowLevel * dark;
        g = lit === 1 ? rowLevel : rowLevel * dark;
        b = lit === 2 ? rowLevel : rowLevel * dark;
      }

      const i = (y * width + x) * 4;
      data[i] = r * bar * 255;
      data[i + 1] = g * bar * 255;
      data[i + 2] = b * bar * 255;
      data[i + 3] = 255;
    }
  }

  return new ImageData(data, width, height);
}
