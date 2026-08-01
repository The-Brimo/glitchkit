import type { Document } from '../types';
import { STEP_DEFAULTS } from '../pipeline/stepTypes';

let uid = 100;
export function nextStepId(): string {
  return `step-${uid++}`;
}

export function createDefaultDocument(): Document {
  return {
    sourceMode: 'generate',
    imageDataURL: null,
    imageName: null,

    generator: 'noise',
    seed: 7,
    width: 1600,
    height: 900,
    palette: 'ember',
    gamma: 1.0,
    invert: false,

    noise: { octaves: 6, freq: 4, warp: 1.2 },
    reaction: { preset: 'coral', steps: 5000, sim: 200 },

    chain: [
      { id: 'step-1', type: 'pixelsort', enabled: true, blend: 'normal', opacity: 100, params: STEP_DEFAULTS.pixelsort() },
      { id: 'step-2', type: 'channelshift', enabled: false, blend: 'screen', opacity: 70, params: STEP_DEFAULTS.channelshift() },
    ],
    snapshots: [],
  };
}
