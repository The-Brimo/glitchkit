/**
 * The only door into the document from untrusted input.
 *
 * Every producer — metadata pulled out of an exported image, a pasted JSON
 * blob, anything a future generator emits — goes through coerceRecipe first.
 * Nothing calls the reducer directly.
 *
 * Design stance: REPAIR, DON'T REJECT. A recipe with one bad threshold should
 * still load with that threshold clamped, not fail wholesale. The only hard
 * failure is input that is not parseable as an object at all. Everything
 * repaired is reported in `warnings` so the UI can be honest about what it
 * changed rather than silently doing something unexpected.
 */

import {
  RECIPE_VERSION,
  BLEND_MODES,
  type BlendMode,
  type CoerceResult,
  type ParamBag,
  type ParamValue,
  type Recipe,
  type RecipeStep,
  emptyRecipe,
} from './schema';
import { MAX_STEPS, SOURCES, TRANSFORMS, type Descriptor, type ParamSpec } from './catalog';

export class RecipeParseError extends Error {}

/** Accepts a JSON string or an already-parsed value. */
export function coerceRecipe(input: unknown): CoerceResult {
  const warnings: string[] = [];
  const raw = parseIfString(input);

  if (!isRecord(raw)) {
    throw new RecipeParseError('Recipe is not an object.');
  }

  const migrated = migrate(raw, warnings);

  const source = coerceSource(migrated.source, warnings);
  const steps = coerceSteps(migrated.steps, warnings);

  const recipe: Recipe = { v: RECIPE_VERSION, source, steps };
  const name = coerceName(migrated.name);
  if (name) recipe.name = name;

  return { recipe, warnings };
}

/** Convenience wrapper for callers that would rather branch than catch. */
export function tryCoerceRecipe(
  input: unknown
): { ok: true; result: CoerceResult } | { ok: false; error: string } {
  try {
    return { ok: true, result: coerceRecipe(input) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── Migration ───────────────────────────────────────────────────── */

function migrate(raw: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  // Legacy: the first export format embedded the whole internal Document
  // (`recipeVersion` + `chain`) rather than a Recipe. Images exported before
  // the recipe format existed must keep loading.
  if (raw.chain !== undefined && raw.v === undefined) {
    return migrateLegacyDocument(raw, warnings);
  }

  const v = typeof raw.v === 'number' ? raw.v : 0;

  if (v === 0) {
    warnings.push('Recipe had no version field; assumed current format.');
  } else if (v > RECIPE_VERSION) {
    warnings.push(`Recipe was written by a newer version (v${v}); unknown fields were ignored.`);
  }

  // Future migrations chain here:
  //   if (v < 2) raw = migrateV1toV2(raw, warnings);

  return raw;
}

function migrateLegacyDocument(raw: Record<string, unknown>, warnings: string[]): Record<string, unknown> {
  warnings.push('Read an image exported before the recipe format; converted it.');

  const imported = raw.sourceMode === 'imported';
  const generator = typeof raw.generator === 'string' ? raw.generator : 'noise';
  const sub = isRecord(raw[generator]) ? (raw[generator] as Record<string, unknown>) : {};

  const params: Record<string, unknown> = {
    ...sub,
    palette: raw.palette,
    gamma: raw.gamma,
    invert: raw.invert,
    seed: raw.seed,
    width: raw.width,
    height: raw.height,
  };

  const chain = Array.isArray(raw.chain) ? raw.chain : [];
  const steps = chain.map((s) => {
    const step = isRecord(s) ? s : {};
    // Legacy opacity was 0..100; the wire format is 0..1.
    const op = typeof step.opacity === 'number' ? step.opacity / 100 : undefined;
    return { t: step.type, on: step.enabled, blend: step.blend, opacity: op, params: step.params };
  });

  return {
    v: RECIPE_VERSION,
    source: { kind: imported ? 'image' : generator, params: imported ? {} : params },
    steps,
  };
}

/* ── Source ──────────────────────────────────────────────────────── */

function coerceSource(raw: unknown, warnings: string[]) {
  const fallback = emptyRecipe().source;

  if (!isRecord(raw)) {
    warnings.push('Missing source; defaulted to noise.');
    return { kind: fallback.kind, params: defaultsFor(SOURCES.noise) };
  }

  const kind = typeof raw.kind === 'string' ? raw.kind : '';
  const desc: Descriptor | undefined = SOURCES[kind];

  if (!desc) {
    warnings.push(
      kind ? `Unknown source "${kind}"; defaulted to noise.` : 'Source had no kind; defaulted to noise.'
    );
    return { kind: 'noise', params: defaultsFor(SOURCES.noise) };
  }

  return { kind, params: coerceParams(raw.params, desc, `source ${kind}`, warnings) };
}

/* ── Steps ───────────────────────────────────────────────────────── */

function coerceSteps(raw: unknown, warnings: string[]): RecipeStep[] {
  if (!Array.isArray(raw)) {
    if (raw !== undefined) warnings.push('Steps was not a list; used none.');
    return [];
  }

  const steps: RecipeStep[] = [];

  for (const entry of raw) {
    if (steps.length >= MAX_STEPS) {
      warnings.push(`Chain exceeded ${MAX_STEPS} steps; the rest were dropped.`);
      break;
    }
    const step = coerceStep(entry, warnings);
    if (step) steps.push(step);
  }

  return steps;
}

function coerceStep(raw: unknown, warnings: string[]): RecipeStep | null {
  if (!isRecord(raw)) {
    warnings.push('Skipped a step that was not an object.');
    return null;
  }

  // Tolerate `type` and `transform` as aliases — models reach for them.
  const named = firstString(raw.t) ?? firstString(raw.type) ?? firstString(raw.transform);

  if (!named) {
    warnings.push('Skipped a step with no transform name.');
    return null;
  }

  // Tolerate camelCase and spaced forms of the ids ("pixelSort", "pixel sort").
  const t = normaliseTransformId(named);

  const desc = TRANSFORMS[t];
  if (!desc) {
    warnings.push(`Skipped unknown transform "${named}".`);
    return null;
  }

  return {
    t,
    on: raw.on === undefined ? true : Boolean(raw.on),
    blend: coerceBlend(raw.blend, t, warnings),
    opacity: clamp01(raw.opacity, 1, `${t}.opacity`, warnings),
    params: coerceParams(raw.params ?? raw.p, desc, t, warnings),
  };
}

function normaliseTransformId(name: string): string {
  const squashed = name.toLowerCase().replace(/[\s_-]+/g, '');
  return Object.keys(TRANSFORMS).find((id) => id === squashed) ?? squashed;
}

function coerceBlend(raw: unknown, ctx: string, warnings: string[]): BlendMode {
  if (raw === undefined) return 'normal';
  const s = String(raw).toLowerCase();
  if ((BLEND_MODES as readonly string[]).includes(s)) return s as BlendMode;
  warnings.push(`${ctx}: unknown blend mode "${raw}"; used normal.`);
  return 'normal';
}

/* ── Params ──────────────────────────────────────────────────────── */

function coerceParams(raw: unknown, desc: Descriptor, ctx: string, warnings: string[]): ParamBag {
  const out: ParamBag = {};
  const given = isRecord(raw) ? raw : {};

  for (const [key, spec] of Object.entries(desc.params)) {
    const value = given[key];
    out[key] = value === undefined ? spec.default : coerceOne(value, spec, `${ctx}.${key}`, warnings);
  }

  for (const key of Object.keys(given)) {
    if (!(key in desc.params)) {
      warnings.push(`${ctx}: ignored unknown parameter "${key}".`);
    }
  }

  return out;
}

function coerceOne(value: unknown, spec: ParamSpec, ctx: string, warnings: string[]): ParamValue {
  if (spec.type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    warnings.push(`${ctx}: expected true/false; used ${spec.default}.`);
    return spec.default;
  }

  if (spec.type === 'enum') {
    const s = String(value).toLowerCase();
    const hit = spec.of.find((o) => o.toLowerCase() === s);
    if (hit) return hit;
    warnings.push(`${ctx}: "${value}" is not a valid option; used ${spec.default}.`);
    return spec.default;
  }

  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    warnings.push(`${ctx}: not a number; used ${spec.default}.`);
    return spec.default;
  }

  let out = spec.int ? Math.round(n) : n;
  if (out < spec.min || out > spec.max) {
    const clamped = Math.min(spec.max, Math.max(spec.min, out));
    warnings.push(`${ctx}: ${out} was outside ${spec.min}–${spec.max}; clamped to ${clamped}.`);
    out = clamped;
  }

  return out;
}

function defaultsFor(desc: Descriptor): ParamBag {
  const out: ParamBag = {};
  for (const [key, spec] of Object.entries(desc.params)) out[key] = spec.default;
  return out;
}

/* ── Small helpers ───────────────────────────────────────────────── */

function parseIfString(input: unknown): unknown {
  if (typeof input !== 'string') return input;
  const cleaned = input
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    throw new RecipeParseError('Recipe was not valid JSON.');
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function firstString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function coerceName(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().slice(0, 80);
  return s.length ? s : undefined;
}

function clamp01(v: unknown, fallback: number, ctx: string, warnings: string[]): number {
  if (v === undefined) return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    warnings.push(`${ctx}: not a number; used ${fallback}.`);
    return fallback;
  }
  if (n < 0 || n > 1) {
    const c = Math.min(1, Math.max(0, n));
    warnings.push(`${ctx}: ${n} was outside 0–1; clamped to ${c}.`);
    return c;
  }
  return n;
}
