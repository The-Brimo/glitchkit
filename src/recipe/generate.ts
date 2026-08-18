/**
 * Recipe generation against a local Ollama server.
 *
 * Deliberately a plain `fetch` against localhost — no SDK, no API key, no
 * network egress. The model runs on the user's machine, so prompts and
 * recipes never leave it, and there is no credential to store or leak.
 *
 * This module only produces a raw string. It never touches the reducer: the
 * reply goes through coerceRecipe like every other untrusted producer.
 */

import { buildResponseSchema, buildSystemPrompt } from './prompt';
import { RECIPE_VERSION, type Recipe } from './schema';

export const DEFAULT_BASE_URL = 'http://localhost:11434';

/**
 * Measured fastest-correct of the locally available models (~4s vs ~20-30s for
 * the others) at equal structural quality. Only a default — the UI lists
 * whatever Ollama actually has and remembers the choice.
 */
export const PREFERRED_MODELS = ['qwen3.6:35b-mlx', 'gemma4:31b-mlx'];

export interface OllamaModel {
  name: string;
  sizeBytes: number;
}

export class OllamaUnavailableError extends Error {}

function isConnectionFailure(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError');
}

/**
 * `signal` lets the caller drop a request it no longer cares about — a URL the
 * user has already typed past. Without it a superseded probe stays open for the
 * full timeout, and against an unreachable host they queue up.
 */
export async function listModels(baseUrl = DEFAULT_BASE_URL, signal?: AbortSignal): Promise<OllamaModel[]> {
  const timeout = AbortSignal.timeout(4000);
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    if (isConnectionFailure(e)) {
      throw new OllamaUnavailableError(`No Ollama server at ${baseUrl}. Start it with: ollama serve`);
    }
    throw e;
  }
  if (!res.ok) throw new OllamaUnavailableError(`Ollama returned ${res.status} listing models.`);

  const data = (await res.json()) as { models?: { name: string; size?: number }[] };
  return (data.models ?? []).map((m) => ({ name: m.name, sizeBytes: m.size ?? 0 }));
}

/** Picks a sensible default from what is actually installed. */
export function pickDefaultModel(models: OllamaModel[]): string | null {
  for (const preferred of PREFERRED_MODELS) {
    if (models.some((m) => m.name === preferred)) return preferred;
  }
  return models[0]?.name ?? null;
}

export interface GenerateOptions {
  baseUrl?: string;
  model: string;
  /** What the user typed. */
  instruction: string;
  /** When present, the model revises this instead of starting from nothing. */
  current?: Recipe;
  signal?: AbortSignal;
}

export interface GenerateResult {
  /** Raw model output — caller must pass it through coerceRecipe. */
  raw: string;
  ms: number;
  model: string;
}

export async function generateRecipe(opts: GenerateOptions): Promise<GenerateResult> {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');

  const userContent = opts.current
    ? [
        'Here is the recipe currently loaded:',
        JSON.stringify(opts.current, null, 1),
        '',
        `Revise it: ${opts.instruction}`,
        'Keep what the instruction does not ask you to change.',
      ].join('\n')
    : opts.instruction;

  const body = {
    model: opts.model,
    messages: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: userContent },
    ],
    stream: false,
    // Enforced on llama.cpp/GGUF backends; silently ignored on MLX. The worked
    // example in the system prompt is what actually carries MLX models.
    format: buildResponseSchema(),
    // These are thinking-capable models. Left on, reasoning consumes the whole
    // token budget and `content` comes back as an empty string with no error.
    think: false,
    options: { temperature: 0.8, num_predict: 900 },
  };

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (isConnectionFailure(e)) {
      throw new OllamaUnavailableError(`Lost connection to Ollama at ${baseUrl}.`);
    }
    throw e;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${detail.slice(0, 200) || res.statusText}`);
  }

  const data = (await res.json()) as { message?: { content?: string; thinking?: string } };
  const raw = data.message?.content ?? '';

  if (!raw.trim()) {
    throw new Error(
      data.message?.thinking
        ? 'The model spent its whole token budget thinking and returned no recipe. Try a smaller request or a different model.'
        : 'The model returned an empty response.'
    );
  }

  return { raw: stampVersion(raw), ms: performance.now() - started, model: opts.model };
}

/**
 * A model is never asked for the schema version — it isn't its business — but
 * this producer knows it emits the current format, so it labels its own output.
 * Without this, every generation raises a spurious "no version field" repair
 * warning meant for genuinely old files. Validation still happens downstream;
 * unparseable output is passed through untouched so the validator reports it.
 */
function stampVersion(raw: string): string {
  try {
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.v === undefined) {
      return JSON.stringify({ v: RECIPE_VERSION, ...parsed });
    }
    return cleaned;
  } catch {
    return raw;
  }
}
