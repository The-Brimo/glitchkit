import type { BlendMode, Document, Snapshot, Step, StepParams, StepType } from '../types';
import { STEP_CREATE, STEP_DEFAULTS } from '../pipeline/stepTypes';
import type { Recipe } from '../recipe/schema';
import { recipeToDocument } from '../recipe/document';

export type DocAction =
  | { type: 'PATCH'; patch: Partial<Document>; historyKey?: string }
  | { type: 'PATCH_NOISE'; patch: Partial<Document['noise']>; historyKey?: string }
  | { type: 'PATCH_REACTION'; patch: Partial<Document['reaction']>; historyKey?: string }
  | { type: 'PATCH_STEP'; id: string; patch: Partial<Step>; historyKey?: string }
  | { type: 'PATCH_STEP_PARAM'; id: string; key: string; value: unknown; historyKey?: string }
  | { type: 'MOVE_STEP'; fromId: string; toId: string }
  | { type: 'ADD_STEP'; id: string; stepType: StepType }
  | { type: 'REMOVE_STEP'; id: string }
  | { type: 'TAKE_SNAPSHOT'; thumb: string }
  | { type: 'RESTORE_SNAPSHOT'; id: string }
  | { type: 'APPLY_RECIPE'; recipe: Recipe }
  | { type: 'SET_FILE'; dataURL: string; name: string };

// A patch whose values already match must return the same object, or no-op edits
// (re-clicking the selected palette, sliding back to the same value) would pollute
// the undo history and trigger pointless re-renders.
function samePatch<T extends object>(target: T, patch: Partial<T>): boolean {
  return Object.entries(patch).every(([k, v]) => Object.is((target as Record<string, unknown>)[k], v));
}

export function docReducer(doc: Document, action: DocAction): Document {
  switch (action.type) {
    case 'PATCH':
      return samePatch(doc, action.patch) ? doc : { ...doc, ...action.patch };
    case 'PATCH_NOISE':
      return samePatch(doc.noise, action.patch) ? doc : { ...doc, noise: { ...doc.noise, ...action.patch } };
    case 'PATCH_REACTION':
      return samePatch(doc.reaction, action.patch) ? doc : { ...doc, reaction: { ...doc.reaction, ...action.patch } };
    case 'PATCH_STEP': {
      const step = doc.chain.find((s) => s.id === action.id);
      if (!step || samePatch(step, action.patch)) return doc;
      return { ...doc, chain: doc.chain.map((s) => (s.id === action.id ? { ...s, ...action.patch } : s)) };
    }
    case 'PATCH_STEP_PARAM': {
      const step = doc.chain.find((s) => s.id === action.id);
      if (!step || Object.is((step.params as unknown as Record<string, unknown>)[action.key], action.value)) return doc;
      return {
        ...doc,
        chain: doc.chain.map((s) =>
          s.id === action.id ? { ...s, params: { ...s.params, [action.key]: action.value } as StepParams } : s
        ),
      };
    }
    case 'MOVE_STEP': {
      if (action.fromId === action.toId) return doc;
      const chain = [...doc.chain];
      const fi = chain.findIndex((s) => s.id === action.fromId);
      const ti = chain.findIndex((s) => s.id === action.toId);
      if (fi < 0 || ti < 0) return doc;
      const [moved] = chain.splice(fi, 1);
      chain.splice(ti, 0, moved);
      return { ...doc, chain };
    }
    case 'ADD_STEP': {
      const create = STEP_CREATE[action.stepType];
      const step: Step = {
        id: action.id,
        type: action.stepType,
        enabled: true,
        blend: (create?.blend ?? 'normal') as BlendMode,
        opacity: create?.opacity ?? 100,
        params: STEP_DEFAULTS[action.stepType](),
      };
      return { ...doc, chain: [...doc.chain, step] };
    }
    case 'REMOVE_STEP':
      return { ...doc, chain: doc.chain.filter((s) => s.id !== action.id) };
    case 'TAKE_SNAPSHOT': {
      const { snapshots, ...rest } = doc;
      const enabled = doc.chain.filter((s) => s.enabled);
      const label = doc.sourceMode === 'imported' ? 'img' : `s${doc.seed}`;
      const title = enabled.length ? enabled.map((s) => s.type).join(' → ') : 'source only';
      const snapshot: Snapshot = {
        id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        label,
        title,
        thumb: action.thumb,
        createdAt: Date.now(),
        doc: rest,
      };
      return { ...doc, snapshots: [snapshot, ...snapshots] };
    }
    case 'RESTORE_SNAPSHOT': {
      const snap = doc.snapshots.find((s) => s.id === action.id);
      if (!snap) return doc;
      return { ...snap.doc, snapshots: doc.snapshots };
    }
    // Swaps source + chain wholesale as ONE history entry, so a loaded look is
    // a single undo away from whatever the user had before.
    case 'APPLY_RECIPE':
      return recipeToDocument(action.recipe, doc);
    case 'SET_FILE':
      return { ...doc, imageDataURL: action.dataURL, imageName: action.name, sourceMode: 'imported' };
    default:
      return doc;
  }
}
