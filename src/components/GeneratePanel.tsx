import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../store/AppState';
import {
  DEFAULT_BASE_URL,
  generateRecipe,
  listModels,
  OllamaUnavailableError,
  pickDefaultModel,
  type OllamaModel,
} from '../recipe/generate';
import { tryCoerceRecipe } from '../recipe/validate';
import { documentToRecipe, describeRecipe } from '../recipe/document';
import { colors, fontMono } from '../theme';
import { Field, SectionHeader, SelectField, TextField, Footnote, PrimaryButton, DividerLine } from './controls';

const LS_MODEL = 'glitchkit.ollama.model';
const LS_BASE_URL = 'glitchkit.ollama.baseUrl';

type Status =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'unavailable'; message: string }
  | { kind: 'generating' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; message: string; warnings: string[] };

export function GeneratePanel() {
  const { doc, dispatch, setSelection } = useAppState();

  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(LS_BASE_URL) || DEFAULT_BASE_URL);
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [model, setModel] = useState(() => localStorage.getItem(LS_MODEL) || '');
  const [instruction, setInstruction] = useState('');
  const [nudge, setNudge] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'checking' });
  const abortRef = useRef<AbortController | null>(null);

  // Discover what Ollama actually has. Re-runs when the URL changes, so
  // pointing at a different host repopulates the model list.
  useEffect(() => {
    let cancelled = false;
    setStatus({ kind: 'checking' });
    listModels(baseUrl)
      .then((found) => {
        if (cancelled) return;
        setModels(found);
        setStatus({ kind: 'ready' });
        setModel((current) => {
          if (current && found.some((m) => m.name === current)) return current;
          return pickDefaultModel(found) ?? '';
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setModels([]);
        setStatus({
          kind: 'unavailable',
          message: e instanceof OllamaUnavailableError ? e.message : String(e),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  useEffect(() => {
    if (model) localStorage.setItem(LS_MODEL, model);
  }, [model]);

  const onGenerate = async () => {
    if (!model || !instruction.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'generating' });

    try {
      const { raw, ms } = await generateRecipe({
        baseUrl,
        model,
        instruction: instruction.trim(),
        current: nudge ? documentToRecipe(doc) : undefined,
        signal: controller.signal,
      });

      const parsed = tryCoerceRecipe(raw);
      if (!parsed.ok) {
        setStatus({ kind: 'error', message: `Model returned unusable output — ${parsed.error}` });
        return;
      }

      const { recipe, warnings } = parsed.result;
      if (!recipe.steps.length) {
        setStatus({ kind: 'error', message: 'The model returned a recipe with no transforms. Try rephrasing.' });
        return;
      }

      dispatch({ type: 'APPLY_RECIPE', recipe });
      setSelection('source');
      setStatus({
        kind: 'done',
        message: `${recipe.name ? `“${recipe.name}” — ` : ''}${describeRecipe(recipe)} (${(ms / 1000).toFixed(1)}s)`,
        warnings,
      });
    } catch (e) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const busy = status.kind === 'generating';
  const offline = status.kind === 'unavailable';

  return (
    <div>
      <SectionHeader>Generate</SectionHeader>

      {offline ? (
        <>
          <div
            style={{
              border: '1px dashed rgba(255,255,255,0.22)',
              borderRadius: 12,
              padding: '14px 12px',
              background: 'rgba(255,255,255,0.03)',
              fontSize: 11,
              lineHeight: 1.6,
              color: colors.textSecondary,
            }}
          >
            No local model server found.
            <div style={{ fontFamily: fontMono, fontSize: 10, marginTop: 8, color: colors.textTertiary }}>ollama serve</div>
          </div>
          <Footnote>Generation runs entirely on your machine — nothing is sent anywhere.</Footnote>
        </>
      ) : (
        <>
          <Field label="Describe the look">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onGenerate();
              }}
              rows={3}
              placeholder={nudge ? 'more aggressive, keep the sort' : 'a corrupted VHS tape'}
              style={{
                width: '100%',
                borderRadius: 8,
                border: `1px solid ${colors.hairlineStrong}`,
                background: colors.controlFill,
                color: '#f2f2f7',
                fontSize: 13,
                fontFamily: 'inherit',
                padding: 8,
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </Field>

          <div
            onClick={() => setNudge(!nudge)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 14 }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                border: `1px solid ${nudge ? colors.accent : colors.hairlineStrong}`,
                background: nudge ? colors.accent : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                color: '#fff',
              }}
            >
              {nudge ? '✓' : ''}
            </div>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Adjust current chain</span>
          </div>

          <Field label="Model">
            <SelectField
              value={model}
              onChange={setModel}
              options={models.map((m) => ({
                value: m.name,
                label: `${m.name}${m.sizeBytes ? `  (${(m.sizeBytes / 1e9).toFixed(1)} GB)` : ''}`,
              }))}
            />
          </Field>

          <PrimaryButton disabled={busy || !instruction.trim() || !model} onClick={onGenerate}>
            {busy ? 'Generating…' : 'Generate'}
          </PrimaryButton>

          {status.kind === 'done' && (
            <div style={{ marginTop: 12, fontSize: 11, color: '#4ade80', lineHeight: 1.5 }}>
              {status.message}
              {status.warnings.length > 0 && (
                <div style={{ color: '#ffb340', marginTop: 4 }}>
                  Repaired {status.warnings.length}: {status.warnings[0]}
                </div>
              )}
            </div>
          )}
          {status.kind === 'error' && (
            <div style={{ marginTop: 12, fontSize: 11, color: colors.destructive, lineHeight: 1.5 }}>{status.message}</div>
          )}

          <Footnote>
            Runs on your machine via Ollama — no API key, no network. Applying a result is a single undo.
          </Footnote>
        </>
      )}

      <DividerLine margin="16px 0 12px" />
      <Field label="Ollama URL" marginBottom={0}>
        <TextField value={baseUrl} onChange={setBaseUrl} onBlur={() => localStorage.setItem(LS_BASE_URL, baseUrl)} />
      </Field>
    </div>
  );
}
