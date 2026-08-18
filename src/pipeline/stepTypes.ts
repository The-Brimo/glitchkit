import type {
  AudioEffect,
  ByteOpsParams,
  ChannelShiftParams,
  DatabendParams,
  DisplaceParams,
  PixelSortParams,
  AudioLabParams,
  JpegLoopParams,
  SliceShuffleParams,
  HalftoneParams,
  FieldParams,
  BlendMode,
  StepType,
} from '../types';

export const STEP_LABELS: Record<StepType, string> = {
  pixelsort: 'Pixel Sort',
  databend: 'Databend',
  channelshift: 'Channel Shift',
  displace: 'Displace',
  byteops: 'Byte Ops',
  audiolab: 'Audio Lab',
  jpegloop: 'JPEG Loop',
  sliceshuffle: 'Slice Shuffle',
  halftone: 'Halftone',
  field: 'Field',
};

export const STEP_DEFAULTS = {
  pixelsort: (): PixelSortParams => ({ direction: 'vertical', sortBy: 'brightness', order: 'ascending', low: 25, high: 140 }),
  databend: (): DatabendParams => ({ mode: 'random', amount: 250, seed: 7 }),
  channelshift: (): ChannelShiftParams => ({ channel: 'red', dx: 12, dy: 0 }),
  displace: (): DisplaceParams => ({ axis: 'rows', amount: 24, scale: 5 }),
  byteops: (): ByteOpsParams => ({ op: 'xor', value: 85, coverage: 40 }),
  audiolab: (): AudioLabParams => ({ effect: 'echo', mix: 60, time: 35, depth: 50, lockLength: true }),
  jpegloop: (): JpegLoopParams => ({ iterations: 10, quality: 20, drive: 30 }),
  sliceshuffle: (): SliceShuffleParams => ({ axis: 'rows', slices: 12, amount: 60, seed: 7 }),
  halftone: (): HalftoneParams => ({ mode: 'bayer', levels: 2, scale: 4 }),
  // Two defaults differ from the source generator's on purpose, both measured
  // against the stock chain: freq 6 (vs 4) because large slow shapes just tint
  // the frame instead of reading as texture, and gamma 1.6 (vs 1) because a
  // mean-0.5 noise field composites as flat haze. Sweeping blend x gamma x
  // opacity, overlay/1.6/70 gave 2.92x the baseline luma contrast at only -7.6
  // mean luma shift; the obvious-looking screen/1.0/70 managed 1.50x while
  // washing the image out by +50.
  field: (): FieldParams => ({
    generator: 'noise',
    octaves: 6,
    freq: 6,
    warp: 1.2,
    preset: 'coral',
    steps: 3000,
    sim: 140,
    palette: 'mono',
    gamma: 1.6,
    invert: false,
    seed: 7,
  }),
};

/**
 * Compositing a step is born with. Destructive steps want normal/100 — they
 * damage what they were handed, so replacing it wholesale is the point. Field
 * ignores its input and synthesises new pixels, so normal/100 would blank the
 * frame the instant you add one. Overlay at 70 was the measured best of the
 * blend/gamma/opacity sweep (see the field defaults above). Anything absent
 * here gets normal/100.
 */
export const STEP_CREATE: Partial<Record<StepType, { blend: BlendMode; opacity: number }>> = {
  field: { blend: 'overlay', opacity: 70 },
};

export const AUDIO_LABELS: Record<AudioEffect, { time: string; depth: string }> = {
  echo: { time: 'Delay', depth: 'Feedback' },
  reverb: { time: 'Room size', depth: 'Decay' },
  bitcrush: { time: 'Bit depth', depth: 'Sample crush' },
  reverse: { time: 'Segment size', depth: 'Segments affected' },
  amplify: { time: 'Gain', depth: 'Clipping' },
  phaser: { time: 'Rate', depth: 'Sweep depth' },
};

export const ADD_TRANSFORM_OPTIONS: { type: StepType; label: string }[] = [
  { type: 'field', label: 'Field (generate noise / reaction)' },
  { type: 'pixelsort', label: 'Pixel Sort' },
  { type: 'databend', label: 'Databend' },
  { type: 'channelshift', label: 'Channel Shift' },
  { type: 'displace', label: 'Row / Column Displace' },
  { type: 'byteops', label: 'Byte Ops' },
  { type: 'audiolab', label: 'Audio Lab' },
  { type: 'jpegloop', label: 'JPEG Loop' },
  { type: 'sliceshuffle', label: 'Slice Shuffle' },
  { type: 'halftone', label: 'Halftone / Dither' },
];
