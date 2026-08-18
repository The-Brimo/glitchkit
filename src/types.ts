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
  | 'field'
  | 'feedback'
  | 'scan'
  | 'glyphs';

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

export type ScanMode = 'scanlines' | 'grille' | 'shadowmask';

/**
 * Synthesised CRT screen. Like FieldParams this describes something generated
 * rather than something done to the image.
 */
export interface ScanParams {
  mode: ScanMode;
  pitch: number; // px at final render resolution
  strength: number; // 0..100 — how hard the mask blocks light
  roll: number; // 0..100 — hum bar height as % of frame; 0 = no bar
  rollPos: number; // 0..100 — vertical position of the bar
}

export type GlyphCharset = 'hex' | 'blocks' | 'ascii' | 'binary';
export type GlyphInk = 'sample' | 'green' | 'amber' | 'white';

/** Additive but input-reading: new marks, placed and coloured by the image. */
export interface GlyphParams {
  charset: GlyphCharset;
  cell: number; // px at final render resolution
  ink: GlyphInk;
  scramble: number; // 0..100 — % of cells given the wrong glyph
  seed: number;
  invert: boolean;
}

export type EchoBlend = 'normal' | 'screen' | 'lighten' | 'difference';

/**
 * Accumulative rather than destructive: the image composited over itself under
 * a repeating affine step, producing trails the source never contained.
 */
export interface FeedbackParams {
  iterations: number;
  zoom: number; // % scale change per echo
  rotate: number; // degrees per echo
  dx: number; // px drift per echo
  dy: number;
  decay: number; // 0..100 — trail falloff
  echoBlend: EchoBlend;
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
  | FieldParams
  | FeedbackParams
  | ScanParams
  | GlyphParams;

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
