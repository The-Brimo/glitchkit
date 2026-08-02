/**
 * Turns the catalog into the two things a generator needs: a system prompt
 * describing every source and transform, and a JSON schema constraining the
 * reply.
 *
 * Both are DERIVED from catalog.ts rather than hand-written, so a parameter
 * that changes in one place can never drift out of sync with what the model is
 * told. That is the whole reason the catalog is machine-readable.
 *
 * Params marked `promptOmit` (seeds, canvas size) appear in neither — the model
 * must not invent them, and they are filled locally instead.
 */

import { CHAIN_NOTES, SOURCES, TRANSFORMS, type Descriptor, type ParamSpec } from './catalog';
import { BLEND_MODES } from './schema';

const GENERATABLE_SOURCES = ['noise', 'reaction'] as const;

/**
 * A worked example of the exact output shape. This is load-bearing, not
 * decoration: Ollama's `format` schema is enforced by grammar-constrained
 * decoding, which the llama.cpp/GGUF backend does and the MLX backend does
 * NOT — on MLX models the schema is accepted and silently ignored. Measured
 * without this example, MLX models wrapped the chain in a "recipe"/"pipeline"
 * key and flattened each step's settings onto the step itself; with it, all
 * tested models returned the correct structure. Do not remove it on the
 * assumption that the schema is doing the work.
 */
const SHAPE_EXEMPLAR = `RETURN EXACTLY THIS SHAPE. Every step's settings go inside its own "params" object — never flattened onto the step:

{
  "name": "Wet VHS",
  "source": { "kind": "noise", "params": { "octaves": 5, "freq": 3, "warp": 1.4, "palette": "ice", "gamma": 1.2 } },
  "steps": [
    { "t": "pixelsort", "blend": "screen", "opacity": 0.7,
      "params": { "direction": "vertical", "sortBy": "brightness", "order": "ascending", "low": 30, "high": 120 } },
    { "t": "displace", "params": { "axis": "rows", "amount": 18, "scale": 4 } },
    { "t": "channelshift", "opacity": 0.6, "params": { "channel": "blue", "dx": -14, "dy": 0 } }
  ]
}

Top-level keys are exactly "name", "source", "steps". Do not use "recipe", "pipeline", "type", or "id".`;

function describeParam(name: string, spec: ParamSpec): string {
  let range: string;
  if (spec.type === 'enum') range = spec.of.join('|');
  else if (spec.type === 'boolean') range = 'true|false';
  else range = `${spec.min}-${spec.max}${spec.int ? ' int' : ''}`;

  return `    ${name} (${range})${spec.feel ? ` — ${spec.feel}` : ''}`;
}

function describe(id: string, desc: Descriptor): string {
  const params = Object.entries(desc.params)
    .filter(([, spec]) => !spec.promptOmit)
    .map(([name, spec]) => describeParam(name, spec));
  return [`  ${id}: ${desc.summary}`, ...params].join('\n');
}

export function buildSystemPrompt(): string {
  const sources = GENERATABLE_SOURCES.map((id) => describe(id, SOURCES[id])).join('\n\n');
  const transforms = Object.entries(TRANSFORMS)
    .map(([id, desc]) => describe(id, desc))
    .join('\n\n');

  return `You design parameter recipes for glitchkit, a glitch-art tool. You are given a look in plain language and you return the settings that produce it.

Respond with JSON only — no prose, no markdown fences.

SOURCES (pick exactly one as "source.kind")

${sources}

TRANSFORMS (each step's "t" is the id)

${transforms}

COMPOSITING
  Every step also takes an optional "blend" (${BLEND_MODES.join('|')}) and "opacity" (0-1, default 1).

HOW TO BUILD A GOOD CHAIN
${CHAIN_NOTES.map((n) => `  - ${n}`).join('\n')}

${SHAPE_EXEMPLAR}

Give the recipe a short evocative "name". Include only the params you actually want to set — anything you omit takes its default. Never include seeds or canvas dimensions.`;
}

/**
 * Response schema. Deliberately loose on per-step `params`: encoding each
 * transform's own param object as a discriminated union produces a grammar that
 * small local models follow poorly, and coerceRecipe already repairs, clamps,
 * and defaults whatever comes back. The high-value constraint is the `t` enum,
 * which stops the model inventing transforms that do not exist.
 */
export function buildResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      name: { type: 'string' },
      source: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: [...GENERATABLE_SOURCES] },
          params: { type: 'object' },
        },
        required: ['kind', 'params'],
      },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            t: { type: 'string', enum: Object.keys(TRANSFORMS) },
            blend: { type: 'string', enum: [...BLEND_MODES] },
            opacity: { type: 'number' },
            params: { type: 'object' },
          },
          required: ['t', 'params'],
        },
      },
    },
    required: ['name', 'source', 'steps'],
  };
}
