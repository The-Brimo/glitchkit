import { useEffect, useState } from 'react';
import { useAppState } from '../store/AppState';
import { colors, fontMono, palettesUI } from '../theme';
import { Field, Segmented, SelectField, Slider, TextField, ToggleRow, SectionHeader, DividerLine, Footnote, NumberField } from './controls';
import type { PaletteName } from '../types';

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Draft-commit wrapper: a fully controlled field would snap back to the last valid
// value on every intermediate keystroke ("1600x" while retyping the height), making
// the size impossible to edit. Commits on a valid value, reverts the draft otherwise.
function SizeField({ width, height, onCommit }: { width: number; height: number; onCommit: (w: number, h: number) => void }) {
  const canonical = `${width}x${height}`;
  const [draft, setDraft] = useState(canonical);
  useEffect(() => setDraft(canonical), [canonical]);

  const commit = (v: string) => {
    const m = v.trim().match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (m) {
      const w = Math.max(16, Math.min(4096, parseInt(m[1], 10)));
      const h = Math.max(16, Math.min(4096, parseInt(m[2], 10)));
      onCommit(w, h);
      setDraft(`${w}x${h}`);
    } else {
      setDraft(canonical);
    }
  };

  return <TextField value={draft} onChange={setDraft} onBlur={() => commit(draft)} onEnter={() => commit(draft)} />;
}

export function SourcePanel() {
  const { doc, dispatch } = useAppState();

  const onFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const dataURL = await readFileAsDataURL(file);
    dispatch({ type: 'SET_FILE', dataURL, name: file.name });
  };

  return (
    <div>
      <SectionHeader>Source</SectionHeader>

      <Segmented
        value={doc.sourceMode === 'imported' ? 'import' : 'generate'}
        onChange={(v) => dispatch({ type: 'PATCH', patch: { sourceMode: v === 'import' ? 'imported' : 'generate' } })}
        options={[
          { value: 'generate', label: 'Generate' },
          { value: 'import', label: 'Open image' },
        ]}
      />

      {doc.sourceMode === 'imported' && (
        <div
          style={{
            border: '1px dashed rgba(255,255,255,0.22)',
            borderRadius: 12,
            padding: '18px 14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
            background: 'rgba(255,255,255,0.03)',
          }}
        >
          <div style={{ fontFamily: fontMono, fontSize: 11, color: colors.textSecondary, textAlign: 'center', wordBreak: 'break-all' }}>
            {doc.imageName || 'drop an image here'}
          </div>
          <label
            style={{
              height: 30,
              padding: '0 14px',
              borderRadius: 8,
              background: colors.secondaryBtn,
              color: '#f2f2f7',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
            }}
          >
            Choose image…
            <input type="file" accept="image/*" onChange={(e) => onFile(e.target.files)} style={{ display: 'none' }} />
          </label>
          <div style={{ fontSize: 10, color: colors.textTertiary, textAlign: 'center', lineHeight: 1.5 }}>
            PNG or JPEG. Pixel sort runs directly; databend converts to JPEG first.
          </div>
        </div>
      )}

      {doc.sourceMode === 'generate' && (
        <>
          <Field label="Generator">
            <SelectField
              value={doc.generator}
              onChange={(v) => dispatch({ type: 'PATCH', patch: { generator: v as any } })}
              options={[
                { value: 'noise', label: 'noise' },
                { value: 'reaction', label: 'reaction' },
              ]}
            />
          </Field>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <Field label="Seed" marginBottom={0}>
                <NumberField value={doc.seed} onChange={(v) => dispatch({ type: 'PATCH', patch: { seed: v }, historyKey: 'seed' })} />
              </Field>
            </div>
            <div
              onClick={() => dispatch({ type: 'PATCH', patch: { seed: doc.seed + Math.floor(Math.random() * 97) + 1 } })}
              title="Reshuffle"
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: 'rgba(255,255,255,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 15,
                color: '#f2f2f7',
              }}
            >
              ⟳
            </div>
          </div>

          <Field label="Size">
            <SizeField
              width={doc.width}
              height={doc.height}
              onCommit={(w, h) => dispatch({ type: 'PATCH', patch: { width: w, height: h } })}
            />
          </Field>

          <Field label="Palette">
            <div style={{ display: 'flex', gap: 8 }}>
              {(Object.keys(palettesUI) as PaletteName[]).map((name) => {
                const p = palettesUI[name];
                const selected = doc.palette === name;
                return (
                  <div
                    key={name}
                    title={name}
                    onClick={() => dispatch({ type: 'PATCH', patch: { palette: name } })}
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                      cursor: 'pointer',
                      boxShadow: selected ? `0 0 0 2px ${colors.windowBg}, 0 0 0 4px ${colors.accent}` : '0 0 0 1px rgba(255,255,255,0.15)',
                    }}
                  />
                );
              })}
            </div>
          </Field>

          <Slider label="Gamma" value={doc.gamma} min={0.5} max={2.5} step={0.1} onChange={(v) => dispatch({ type: 'PATCH', patch: { gamma: v }, historyKey: 'gamma' })} />

          <ToggleRow label="Invert" checked={doc.invert} onChange={(v) => dispatch({ type: 'PATCH', patch: { invert: v } })} onColor={colors.accent} />

          {doc.generator === 'noise' && (
            <>
              <DividerLine margin="4px 0 14px" />
              <SectionHeader>Noise params</SectionHeader>
              <Slider label="Octaves" value={doc.noise.octaves} min={3} max={8} step={1} onChange={(v) => dispatch({ type: 'PATCH_NOISE', patch: { octaves: v }, historyKey: 'octaves' })} />
              <Slider label="Freq" value={doc.noise.freq} min={1} max={10} step={1} onChange={(v) => dispatch({ type: 'PATCH_NOISE', patch: { freq: v }, historyKey: 'freq' })} />
              <Slider label="Warp" value={doc.noise.warp} min={0} max={2} step={0.1} onChange={(v) => dispatch({ type: 'PATCH_NOISE', patch: { warp: v }, historyKey: 'warp' })} />
            </>
          )}

          {doc.generator === 'reaction' && (
            <>
              <DividerLine margin="4px 0 14px" />
              <SectionHeader>Reaction params</SectionHeader>
              <Field label="Preset">
                <SelectField
                  value={doc.reaction.preset}
                  onChange={(v) => dispatch({ type: 'PATCH_REACTION', patch: { preset: v as any } })}
                  options={['coral', 'maze', 'spots', 'mitosis', 'fingerprint', 'flower'].map((p) => ({ value: p, label: p }))}
                />
              </Field>
              <Slider label="Steps" value={doc.reaction.steps} min={1000} max={10000} step={500} onChange={(v) => dispatch({ type: 'PATCH_REACTION', patch: { steps: v }, historyKey: 'steps' })} />
              <Slider label="Sim detail" value={doc.reaction.sim} min={100} max={300} step={10} onChange={(v) => dispatch({ type: 'PATCH_REACTION', patch: { sim: v }, historyKey: 'sim' })} />
              <Footnote>slower — real simulation, preview is reduced quality for responsiveness</Footnote>
            </>
          )}
        </>
      )}
    </div>
  );
}
