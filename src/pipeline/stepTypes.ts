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
