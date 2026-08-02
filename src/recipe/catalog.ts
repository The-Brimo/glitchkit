/**
 * What a legal glitchkit parameter is, in machine-readable form.
 *
 * Consumers:
 *   1. validate.ts — clamps and defaults untrusted input against it
 *   2. any future generator — serialises it into a prompt
 *   3. docs — human-readable parameter reference for free
 *
 * DEFAULTS ARE NOT DECLARED HERE. They are imported from STEP_DEFAULTS in
 * pipeline/stepTypes.ts, which stays the single typed source of truth. This
 * file only adds what the type system cannot express: ranges, and perceptual
 * grounding. Duplicating the defaults here would create a second place to
 * forget to update.
 *
 * Known remaining duplication: the slider min/max in components/TransformPanel
 * are still hand-written and must agree with the ranges below. Unifying those
 * (panels reading ranges from here) is a clean follow-up.
 *
 * On `feel`: this is the highest-leverage text here for generation quality.
 * A model has no idea what `low: 25, high: 140` looks like on this pixel
 * sorter. One sentence of perceptual grounding per numeric param does more
 * than any amount of prompt wording. It is never shown in the UI.
 */

import { STEP_DEFAULTS } from '../pipeline/stepTypes';
import type {
  AudioLabParams,
  ByteOpsParams,
  ChannelShiftParams,
  DatabendParams,
  DisplaceParams,
  HalftoneParams,
  JpegLoopParams,
  PixelSortParams,
  SliceShuffleParams,
} from '../types';

/**
 * `promptOmit` marks params a generator must never invent — seeds (so repeat
 * runs vary) and canvas size (so a generated look doesn't silently resize the
 * user's document). They are filled locally instead, and are left out of both
 * the serialised prompt and the response schema.
 */
export type ParamSpec =
  | {
      type: 'number';
      min: number;
      max: number;
      default: number;
      /** Integer-only (slice counts, pass counts, 0–255 thresholds). */
      int?: boolean;
      /** Perceptual anchors for a generating model. Prompt-only, never UI. */
      feel?: string;
      promptOmit?: boolean;
    }
  | { type: 'enum'; of: readonly string[]; default: string; feel?: string; promptOmit?: boolean }
  | { type: 'boolean'; default: boolean; feel?: string; promptOmit?: boolean };

export interface Descriptor {
  /** One line, written for a model that has never seen the output. */
  summary: string;
  params: Record<string, ParamSpec>;
}

// Defaults pulled from the typed source rather than restated.
const D = {
  pixelsort: STEP_DEFAULTS.pixelsort() as PixelSortParams,
  databend: STEP_DEFAULTS.databend() as DatabendParams,
  channelshift: STEP_DEFAULTS.channelshift() as ChannelShiftParams,
  displace: STEP_DEFAULTS.displace() as DisplaceParams,
  byteops: STEP_DEFAULTS.byteops() as ByteOpsParams,
  audiolab: STEP_DEFAULTS.audiolab() as AudioLabParams,
  jpegloop: STEP_DEFAULTS.jpegloop() as JpegLoopParams,
  sliceshuffle: STEP_DEFAULTS.sliceshuffle() as SliceShuffleParams,
  halftone: STEP_DEFAULTS.halftone() as HalftoneParams,
};

/** Seeds are filled client-side so repeated generations vary. */
const seedSpec = (dflt: number): ParamSpec => ({
  type: 'number',
  min: 0,
  max: 999999,
  default: dflt,
  int: true,
  promptOmit: true,
});

/* ── Sources ─────────────────────────────────────────────────────── */

export const PALETTES = ['ember', 'ice', 'magma', 'acid', 'mono'] as const;

// Shared by both generators — these live on the Document, not on a sub-object.
const COMMON_SOURCE_PARAMS: Record<string, ParamSpec> = {
  palette: {
    type: 'enum',
    of: PALETTES,
    default: 'ember',
    feel: 'ember teal-to-orange and fiery, ice deep blue to white, magma purple to yellow, acid green to lime, mono grayscale',
  },
  gamma: {
    type: 'number',
    min: 0.5,
    max: 2.5,
    default: 1,
    feel: 'above 1 darkens the midtones for a glowing-core look, below 1 lifts and flattens them',
  },
  invert: { type: 'boolean', default: false },
  seed: seedSpec(7),
  width: { type: 'number', min: 16, max: 4096, default: 1600, int: true, promptOmit: true },
  height: { type: 'number', min: 16, max: 4096, default: 900, int: true, promptOmit: true },
};

export const SOURCES: Record<string, Descriptor> = {
  noise: {
    summary:
      'Seeded fractal value noise with domain warping. Cloudy, organic, flowing fields — the general-purpose base.',
    params: {
      octaves: {
        type: 'number',
        min: 3,
        max: 8,
        default: 6,
        int: true,
        feel: '3 soft broad forms, 6 balanced detail, 8 busy and fine-grained',
      },
      freq: {
        type: 'number',
        min: 1,
        max: 10,
        default: 4,
        int: true,
        feel: 'low = large slow shapes filling the frame, high = small busy repeating texture',
      },
      warp: {
        type: 'number',
        min: 0,
        max: 2,
        default: 1.2,
        feel: '0 clean layered noise, 1 marbled and swirled, 2 heavily smeared and liquid',
      },
      ...COMMON_SOURCE_PARAMS,
    },
  },
  reaction: {
    summary:
      'Gray–Scott reaction-diffusion. Biological, self-organising pattern — more structured and alien than noise, and much slower to render.',
    params: {
      preset: {
        type: 'enum',
        of: ['coral', 'maze', 'spots', 'mitosis', 'fingerprint', 'flower'],
        default: 'coral',
        feel: 'coral branching growth, maze dense labyrinth, spots isolated cells, mitosis dividing blobs, fingerprint ridged whorls, flower radial bloom',
      },
      steps: {
        type: 'number',
        min: 1000,
        max: 10000,
        default: 5000,
        int: true,
        feel: 'how far the simulation runs; more = more developed pattern and a slower render',
      },
      sim: {
        type: 'number',
        min: 100,
        max: 300,
        default: 200,
        int: true,
        feel: 'internal grid resolution; higher = finer structure, disproportionately slower',
      },
      ...COMMON_SOURCE_PARAMS,
    },
  },
  image: {
    summary:
      'An imported photo. Cannot be generated — only valid when the user already has a file open. A recipe never carries the image itself.',
    params: {},
  },
};

/* ── Transforms ──────────────────────────────────────────────────── */

export const TRANSFORMS: Record<string, Descriptor> = {
  pixelsort: {
    summary:
      'Sorts contiguous runs of pixels whose sort-key falls between low and high. The signature glitch-art streak.',
    params: {
      direction: {
        type: 'enum',
        of: ['vertical', 'horizontal'],
        default: D.pixelsort.direction,
        feel: 'the axis pixels slide along — vertical drips downward, horizontal smears sideways',
      },
      sortBy: {
        type: 'enum',
        of: ['brightness', 'hue', 'saturation', 'red', 'green', 'blue'],
        default: D.pixelsort.sortBy,
        feel: 'brightness is the classic look, hue produces rainbow banding, single channels skew the colour cast',
      },
      order: {
        type: 'enum',
        of: ['ascending', 'descending'],
        default: D.pixelsort.order,
        feel: 'flips which end of the run the bright pixels collect at',
      },
      low: {
        type: 'number',
        min: 0,
        max: 255,
        default: D.pixelsort.low,
        int: true,
        feel: 'lower bound of the sorted band on the 0–255 sort key',
      },
      high: {
        type: 'number',
        min: 0,
        max: 255,
        default: D.pixelsort.high,
        int: true,
        feel: 'upper bound. The WIDTH of the low–high band is what matters: a narrow band (25–60) gives sparse streaks, a wide one (25–200) melts most of the frame, and 0–255 sorts every pixel.',
      },
    },
  },
  databend: {
    summary:
      'Corrupts the encoded JPEG byte stream directly. Blocky macroblock tearing and colour-shifted bands that cascade downward from each hit.',
    params: {
      mode: {
        type: 'enum',
        of: ['random', 'shift', 'reverse'],
        default: D.databend.mode,
        feel: 'random scattered damage, shift slides a coherent run of bytes, reverse mirrors a chunk',
      },
      amount: {
        type: 'number',
        min: 0,
        max: 500,
        default: D.databend.amount,
        int: true,
        feel: 'also controls how far up the image damage may start: 50 leaves most of the frame clean with corruption low down, 250 is clearly broken through the lower half, 500 can reach the top and wreck everything',
      },
      seed: seedSpec(D.databend.seed),
    },
  },
  channelshift: {
    summary: 'Offsets one colour channel with wraparound. Chromatic aberration, 3D-glasses fringing.',
    params: {
      channel: {
        type: 'enum',
        of: ['red', 'green', 'blue'],
        default: D.channelshift.channel,
      },
      dx: {
        type: 'number',
        min: -60,
        max: 60,
        default: D.channelshift.dx,
        int: true,
        feel: 'under 10px reads as subtle fringing, 30+ as a distinct ghost image',
      },
      dy: { type: 'number', min: -60, max: 60, default: D.channelshift.dy, int: true },
    },
  },
  displace: {
    summary:
      'Noise-driven per-row or per-column offsets. Wavy heat-haze or bad-tracking distortion, with smooth continuity between lines.',
    params: {
      axis: { type: 'enum', of: ['rows', 'columns'], default: D.displace.axis },
      amount: {
        type: 'number',
        min: 0,
        max: 120,
        default: D.displace.amount,
        int: true,
        feel: '10 gentle wobble, 40 strong tearing, 120 barely recognisable',
      },
      scale: {
        type: 'number',
        min: 1,
        max: 20,
        default: D.displace.scale,
        int: true,
        feel: 'low = long smooth waves, high = jittery per-line noise',
      },
    },
  },
  byteops: {
    summary:
      'Bitwise operations over a fraction of the JPEG stream. Harsher and more uniformly digital than databend.',
    params: {
      op: {
        type: 'enum',
        of: ['xor', 'rotate', 'and', 'add'],
        default: D.byteops.op,
        feel: 'xor inverts violently, rotate scrambles evenly, and darkens and drops detail, add brightens and shifts hue',
      },
      value: { type: 'number', min: 0, max: 255, default: D.byteops.value, int: true },
      coverage: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.byteops.coverage,
        int: true,
        feel: 'percentage, on a steep curve — under 30 stays subtle and low in the frame, 60 is pervasive, 100 corrupts from the top down',
      },
    },
  },
  audiolab: {
    summary:
      'Treats the raw pixel bytes as headerless PCM audio and runs DSP over them — the classic Audacity databending move. Delay-based effects are snapped to whole image rows, so echoes appear as vertically offset ghosts of the picture.',
    params: {
      effect: {
        type: 'enum',
        of: ['echo', 'reverb', 'bitcrush', 'reverse', 'amplify', 'phaser'],
        default: D.audiolab.effect,
        feel: 'echo repeating vertical ghost copies, reverb smeared trails, bitcrush posterised banding, reverse mirrored bands, amplify blown-out clipping, phaser horizontal interference ripples',
      },
      time: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.audiolab.time,
        int: true,
        feel: 'first slider, meaning depends on effect: delay length / room size / bit depth / segment size / gain / rate',
      },
      depth: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.audiolab.depth,
        int: true,
        feel: 'second slider: feedback / decay / sample crush / how many segments are hit / clipping / sweep depth',
      },
      mix: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.audiolab.mix,
        int: true,
        feel: 'percentage of wet signal. 20–30 leaves the image clearly readable with texture over it, 100 is the raw effect',
      },
      lockLength: {
        type: 'boolean',
        default: D.audiolab.lockLength,
        feel: 'true keeps the byte count fixed; false lets effect tails run past the end and wrap onto the top of the image',
      },
    },
  },
  jpegloop: {
    summary: 'Repeated JPEG re-encoding. Generation loss — the deep-fried, over-shared-meme look.',
    params: {
      iterations: {
        type: 'number',
        min: 1,
        max: 40,
        default: D.jpegloop.iterations,
        int: true,
        feel: '3 subtle mush, 10 obvious ringing and blocking, 30+ fully destroyed',
      },
      quality: {
        type: 'number',
        min: 1,
        max: 60,
        default: D.jpegloop.quality,
        int: true,
        feel: 'JPEG quality percent per pass; lowering this compounds damage far faster than adding passes',
      },
      drive: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.jpegloop.drive,
        int: true,
        feel: 'per-pass saturation and contrast boost — this is what makes it look fried rather than merely soft',
      },
    },
  },
  sliceshuffle: {
    summary:
      'Cuts the image into slices along one axis and permutes a fraction of them. Hard-edged displacement, unlike displace’s smooth waves.',
    params: {
      axis: { type: 'enum', of: ['rows', 'columns'], default: D.sliceshuffle.axis },
      slices: {
        type: 'number',
        min: 2,
        max: 64,
        default: D.sliceshuffle.slices,
        int: true,
        feel: 'few large slices read as deliberate collage, many thin ones as signal noise',
      },
      amount: {
        type: 'number',
        min: 0,
        max: 100,
        default: D.sliceshuffle.amount,
        int: true,
        feel: 'percentage of slices that actually move; 20 keeps the subject legible, 80 does not',
      },
      seed: seedSpec(D.sliceshuffle.seed),
    },
  },
  halftone: {
    summary: 'Ordered dither, error diffusion, or a colour dot screen. Print and early-digital texture.',
    params: {
      mode: {
        type: 'enum',
        of: ['bayer', 'diffusion', 'dots'],
        default: D.halftone.mode,
        feel: 'bayer regular crosshatch grid, diffusion organic film-grain stipple, dots newsprint rosette on a near-black ground',
      },
      levels: {
        type: 'number',
        min: 2,
        max: 8,
        default: D.halftone.levels,
        int: true,
        feel: 'quantisation steps per channel: 2 is harsh posterisation, 8 retains most tonal range. Ignored by dots.',
      },
      scale: {
        type: 'number',
        min: 2,
        max: 12,
        default: D.halftone.scale,
        int: true,
        feel: 'cell size: 2 fine and nearly continuous, 12 chunky and graphic. Ignored by diffusion.',
      },
    },
  },
};

/* ── Chain guidance ──────────────────────────────────────────────── */

/**
 * Ordering heuristics to feed a generator alongside the catalog. These encode
 * what you learn by hand after a few dozen chains.
 */
export const CHAIN_NOTES = [
  'Byte-domain steps (databend, byteops, jpegloop) re-encode the image. Anything after them operates on already-damaged data, so place them late unless compounding damage is the goal.',
  'pixelsort reads structure, so it works best before heavy displacement destroys the structure it would sort along.',
  'channelshift and halftone are good finishers — they unify a chaotic chain visually.',
  'Two byte-domain steps back to back usually destroys the image. Separate them with a pixel-domain step.',
  'Three to five steps is the sweet spot. Above seven, individual steps stop being legible in the result.',
  'Every step has a blend mode and opacity. Dropping a destructive step to 40–60% opacity, or blending it with screen or overlay, is often the difference between texture and mud.',
] as const;

export const MAX_STEPS = 12;

export function isTransform(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRANSFORMS, id);
}

export function isSource(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(SOURCES, id);
}
