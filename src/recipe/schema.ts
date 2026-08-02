/**
 * The versioned, serializable form of a glitchkit document.
 *
 * This is deliberately NOT the internal `Document` type. It is the wire
 * format: what gets embedded in export metadata, what a generator emits, what
 * a snapshot could round-trip through. Keeping it separate means the internal
 * model stays free to change without invalidating every image ever exported.
 *
 * Rules for evolving this file:
 *   - Never remove or repurpose a field. Add optional ones.
 *   - Bump RECIPE_VERSION when a change is not backward-readable, and add a
 *     migration in validate.ts rather than rejecting old recipes.
 *
 * Two deliberate divergences from the internal model, both handled in exactly
 * one place (recipe/document.ts):
 *   - `opacity` is 0..1 here, 0..100 internally. Normalised is the conventional
 *     wire representation and survives an internal change of units.
 *   - `on` rather than `enabled`, so a rename internally is not a format break.
 */

export const RECIPE_VERSION = 1;

/** Any parameter value a source or transform can carry. */
export type ParamValue = number | string | boolean;

export type ParamBag = Record<string, ParamValue>;

export interface RecipeSource {
  /** Generator id, or "image" when the base was an imported file. */
  kind: string;
  params: ParamBag;
}

export const BLEND_MODES = [
  'normal',
  'screen',
  'multiply',
  'overlay',
  'difference',
  'lighten',
  'darken',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

export interface RecipeStep {
  /** Transform id — must exist in TRANSFORMS. */
  t: string;
  /** Bypassed steps are kept in the chain but skipped at render. */
  on?: boolean;
  blend?: BlendMode;
  /** 0..1 */
  opacity?: number;
  params: ParamBag;
}

export interface Recipe {
  v: number;
  /** Optional human label. Generators fill this; exports may not. */
  name?: string;
  source: RecipeSource;
  steps: RecipeStep[];
}

/**
 * What coerceRecipe hands back. `warnings` is never an error channel — it is
 * the list of things that were silently repaired, so the UI can surface
 * "3 parameters were clamped" instead of failing or lying.
 */
export interface CoerceResult {
  recipe: Recipe;
  warnings: string[];
}

export function emptyRecipe(): Recipe {
  return {
    v: RECIPE_VERSION,
    source: { kind: 'noise', params: {} },
    steps: [],
  };
}
