/**
 * The only place that knows both the wire format and the internal model.
 *
 * Everything else in src/recipe/ is written against Recipe and has no idea
 * what a `Step` or `Document` looks like; everything outside it works in
 * Documents. Keeping the translation in one file means changing the internal
 * model touches exactly this file, and changing the format likewise.
 *
 * Conversions that live here and nowhere else:
 *   opacity   0..1 (wire)  <->  0..100 (internal)
 *   on        (wire)       <->  enabled (internal)
 *   flat source params     <->  Document fields + noise/reaction sub-objects
 *   step ids               minted fresh on the way in, dropped on the way out
 */

import type {
  Document,
  Generator,
  PaletteName,
  ReactionPreset,
  Step,
  StepParams,
  StepType,
} from '../types';
import type { ParamBag, Recipe, RecipeStep } from './schema';
import { RECIPE_VERSION } from './schema';
import { SOURCES, TRANSFORMS } from './catalog';
import { nextStepId } from '../store/defaultDocument';

function num(bag: ParamBag, key: string, fallback: number): number {
  const v = bag[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str<T extends string>(bag: ParamBag, key: string, fallback: T): T {
  const v = bag[key];
  return typeof v === 'string' && v.length ? (v as T) : fallback;
}

function bool(bag: ParamBag, key: string, fallback: boolean): boolean {
  const v = bag[key];
  return typeof v === 'boolean' ? v : fallback;
}

/**
 * Apply a recipe on top of an existing document.
 *
 * `base` supplies everything a recipe deliberately cannot carry: the imported
 * image bytes, its filename, and the snapshot list. Applying a recipe changes
 * the look, it does not discard the user's work or their loaded photo.
 */
export function recipeToDocument(recipe: Recipe, base: Document): Document {
  const kind = recipe.source.kind;
  const p = recipe.source.params;
  const isImage = kind === 'image';
  const generator: Generator = kind === 'reaction' ? 'reaction' : 'noise';

  return {
    ...base,
    sourceMode: isImage ? 'imported' : 'generate',
    // The image itself is never in a recipe — keep whatever is loaded.
    imageDataURL: base.imageDataURL,
    imageName: base.imageName,

    generator: isImage ? base.generator : generator,
    seed: isImage ? base.seed : num(p, 'seed', base.seed),
    width: isImage ? base.width : num(p, 'width', base.width),
    height: isImage ? base.height : num(p, 'height', base.height),
    palette: isImage ? base.palette : str<PaletteName>(p, 'palette', base.palette),
    gamma: isImage ? base.gamma : num(p, 'gamma', base.gamma),
    invert: isImage ? base.invert : bool(p, 'invert', base.invert),

    noise:
      kind === 'noise'
        ? {
            octaves: num(p, 'octaves', base.noise.octaves),
            freq: num(p, 'freq', base.noise.freq),
            warp: num(p, 'warp', base.noise.warp),
          }
        : base.noise,

    reaction:
      kind === 'reaction'
        ? {
            preset: str<ReactionPreset>(p, 'preset', base.reaction.preset),
            steps: num(p, 'steps', base.reaction.steps),
            sim: num(p, 'sim', base.reaction.sim),
          }
        : base.reaction,

    chain: recipe.steps.map(stepFromRecipe),
    snapshots: base.snapshots,
  };
}

function stepFromRecipe(rs: RecipeStep): Step {
  return {
    id: nextStepId(),
    type: rs.t as StepType,
    enabled: rs.on !== false,
    blend: rs.blend ?? 'normal',
    // Wire is 0..1, internal is a percentage.
    opacity: Math.round((rs.opacity ?? 1) * 100),
    params: { ...rs.params } as unknown as StepParams,
  };
}

/** Serialise the current document into the wire format. */
export function documentToRecipe(doc: Document, name?: string): Recipe {
  const recipe: Recipe = {
    v: RECIPE_VERSION,
    source: sourceFromDocument(doc),
    steps: doc.chain.map(stepToRecipe),
  };
  if (name) recipe.name = name;
  return recipe;
}

function sourceFromDocument(doc: Document): Recipe['source'] {
  if (doc.sourceMode === 'imported') {
    return { kind: 'image', params: {} };
  }

  const common: ParamBag = {
    palette: doc.palette,
    gamma: doc.gamma,
    invert: doc.invert,
    seed: doc.seed,
    width: doc.width,
    height: doc.height,
  };

  const specific: ParamBag =
    doc.generator === 'reaction'
      ? { preset: doc.reaction.preset, steps: doc.reaction.steps, sim: doc.reaction.sim }
      : { octaves: doc.noise.octaves, freq: doc.noise.freq, warp: doc.noise.warp };

  return { kind: doc.generator, params: { ...specific, ...common } };
}

function stepToRecipe(step: Step): RecipeStep {
  return {
    t: step.type,
    on: step.enabled,
    blend: step.blend,
    opacity: step.opacity / 100,
    params: { ...step.params } as unknown as ParamBag,
  };
}

/**
 * Human-readable one-liner for a recipe, e.g.
 * "noise · ember · Pixel Sort → Databend". Used in import confirmations.
 */
export function describeRecipe(recipe: Recipe): string {
  const src =
    recipe.source.kind === 'image'
      ? 'imported image'
      : `${recipe.source.kind} · ${recipe.source.params.palette ?? '—'}`;
  const names = recipe.steps.map((s) => s.t).join(' → ');
  return names ? `${src} · ${names}` : `${src} · no transforms`;
}

/** Ids a recipe may legally name, for prompt assembly and docs. */
export const KNOWN_SOURCE_IDS = Object.keys(SOURCES);
export const KNOWN_TRANSFORM_IDS = Object.keys(TRANSFORMS);
