export type Generator = 'noise' | 'reaction';
export type PaletteName = 'ember' | 'ice' | 'magma' | 'acid' | 'mono';
export type ReactionPreset = 'coral' | 'maze' | 'spots' | 'mitosis' | 'fingerprint' | 'flower';

export type StepType =
  | 'pixelsort'
  | 'databend'
  | 'channelshift'
  | 'displace'
  | 'byteops'
  | 'audiolab'
  | 'jpegloop'
  | 'sliceshuffle'
  | 'halftone'
  | 'field';

export type BlendMode =
  | 'normal'
  | 'screen'
  | 'multiply'
  | 'overlay'
  | 'difference'
  | 'lighten'
  | 'darken';

export type SortKey = 'brightness' | 'hue' | 'saturation' | 'red' | 'green' | 'blue';

export interface PixelSortParams {
  direction: 'vertical' | 'horizontal';
  sortBy: SortKey;
  order: 'ascending' | 'descending';
  low: number;
  high: number;
}

export interface DatabendParams {
  mode: 'random' | 'shift' | 'reverse';
  amount: number;
  seed: number;
}

export interface ChannelShiftParams {
  channel: 'red' | 'green' | 'blue';
  dx: number;
  dy: number;
}

export interface DisplaceParams {
  axis: 'rows' | 'columns';
  amount: number;
  scale: number;
}

export interface ByteOpsParams {
  op: 'xor' | 'rotate' | 'and' | 'add';
  value: number;
  coverage: number;
}

export type AudioEffect = 'echo' | 'reverb' | 'bitcrush' | 'reverse' | 'amplify' | 'phaser';

export interface AudioLabParams {
  effect: AudioEffect;
  mix: number;
  time: number;
  depth: number;
  lockLength: boolean;
}

export interface JpegLoopParams {
  iterations: number;
  quality: number; // 1..60 (%)
  drive: number; // 0..100 — saturation/contrast boost per pass
}

export interface SliceShuffleParams {
  axis: 'rows' | 'columns';
  slices: number;
  amount: number; // 0..100 — % of slices that get shuffled
  seed: number;
}

export interface HalftoneParams {
  mode: 'bayer' | 'diffusion' | 'dots';
  levels: number; // 2..8 quantisation levels per channel
  scale: number; // 2..12 cell size (bayer & dot screen)
}

/**
 * The one generative step: it ignores its input entirely and synthesises a
 * fresh field, which the pipeline's existing per-step blend + opacity then
 * composites over the image. Carries the full generator config rather than
 * reading the document's, so several Field steps in one chain can differ.
 */
export interface FieldParams {
  generator: Generator;
  // noise
  octaves: number;
  freq: number;
  warp: number;
  // reaction
  preset: ReactionPreset;
  steps: number;
  sim: number;
  // shared colouring
  palette: PaletteName;
  gamma: number;
  invert: boolean;
  seed: number;
}

export type StepParams =
  | PixelSortParams
  | DatabendParams
  | ChannelShiftParams
  | DisplaceParams
  | ByteOpsParams
  | AudioLabParams
  | JpegLoopParams
  | SliceShuffleParams
  | HalftoneParams
  | FieldParams;

export interface Step {
  id: string;
  type: StepType;
  enabled: boolean;
  blend: BlendMode;
  opacity: number; // 0..100
  params: StepParams;
}

export interface Snapshot {
  id: string;
  label: string;
  title: string;
  thumb: string; // data URL
  createdAt: number;
  doc: Omit<Document, 'snapshots'>;
}

export interface Document {
  sourceMode: 'generate' | 'imported';
  imageDataURL: string | null;
  imageName: string | null;

  generator: Generator;
  seed: number;
  width: number;
  height: number;
  palette: PaletteName;
  gamma: number;
  invert: boolean;

  noise: { octaves: number; freq: number; warp: number };
  reaction: { preset: ReactionPreset; steps: number; sim: number };

  chain: Step[];
  snapshots: Snapshot[];
}

export type Selection = 'source' | { step: string };
