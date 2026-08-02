import { useRef, useState } from 'react';
import { useAppState } from '../store/AppState';
import { useRenderEngine } from '../store/RenderEngine';
import { exportImage } from '../pipeline/exportImage';
import { readRecipeFromFile } from '../recipe/parse';
import { tryCoerceRecipe } from '../recipe/validate';
import { describeRecipe } from '../recipe/document';
import { colors } from '../theme';

export function Toolbar({ onSearch }: { onSearch: (q: string) => void }) {
  const { doc, dispatch, setSelection, undo, redo, canUndo, canRedo } = useAppState();
  const { renderFull, status } = useRenderEngine();
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  const flash = (tone: 'ok' | 'warn' | 'error', text: string) => {
    setNotice({ tone, text });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 7000);
  };

  const onImport = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const raw = await readRecipeFromFile(file);
      const parsed = tryCoerceRecipe(raw);
      if (!parsed.ok) {
        flash('error', parsed.error);
        return;
      }
      const { recipe, warnings } = parsed.result;
      dispatch({ type: 'APPLY_RECIPE', recipe });
      setSelection('source');
      if (warnings.length) {
        flash('warn', `Loaded ${describeRecipe(recipe)} — repaired ${warnings.length}: ${warnings[0]}`);
      } else {
        flash('ok', `Loaded ${describeRecipe(recipe)}`);
      }
    } catch (e) {
      flash('error', e instanceof Error ? e.message : String(e));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const canExport = !exporting && status !== 'rendering' && !(doc.sourceMode === 'imported' && !doc.imageDataURL);

  const onExport = async () => {
    if (!canExport) return;
    setExporting(true);
    try {
      const canvas = await renderFull();
      if (!canvas) return;
      const { blob, filename } = await exportImage(doc, canvas);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between', position: 'relative' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>glitchkit — basegen</div>

      {notice && (
        <div
          onClick={() => setNotice(null)}
          title="Click to dismiss"
          style={{
            position: 'absolute',
            left: 190,
            right: 200,
            top: 9,
            height: 34,
            display: 'flex',
            alignItems: 'center',
            padding: '0 12px',
            borderRadius: 10,
            fontSize: 11,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            background:
              notice.tone === 'error' ? 'rgba(255,69,58,0.16)' : notice.tone === 'warn' ? 'rgba(255,159,10,0.16)' : 'rgba(48,209,88,0.16)',
            border: `1px solid ${
              notice.tone === 'error' ? 'rgba(255,69,58,0.4)' : notice.tone === 'warn' ? 'rgba(255,159,10,0.4)' : 'rgba(48,209,88,0.4)'
            }`,
            color: notice.tone === 'error' ? colors.destructive : notice.tone === 'warn' ? '#ffb340' : '#4ade80',
          }}
        >
          {notice.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          title="Undo"
          onClick={undo}
          disabled={!canUndo}
          style={iconBtnStyle(canUndo)}
        >
          ⟲
        </button>
        <button
          title="Redo"
          onClick={redo}
          disabled={!canRedo}
          style={iconBtnStyle(canRedo)}
        >
          ⟳
        </button>
        <button
          title="Load recipe — pick an image glitchkit exported (or a .json recipe) to restore its settings"
          onClick={() => importRef.current?.click()}
          style={iconBtnStyle(true)}
        >
          ⤒
        </button>
        <input
          ref={importRef}
          type="file"
          accept="image/png,image/jpeg,application/json,.json"
          onChange={(e) => onImport(e.target.files)}
          style={{ display: 'none' }}
        />
        <button
          title="Export image (PNG, or JPEG when the chain ends in a byte-level step; settings embedded in metadata)"
          onClick={onExport}
          disabled={!canExport}
          style={iconBtnStyle(canExport)}
        >
          {exporting ? '…' : '⤓'}
        </button>
        <div
          style={{
            width: 140,
            height: 36,
            borderRadius: 12,
            background: 'rgba(255,255,255,0.08)',
            border: '0.5px solid rgba(255,255,255,0.12)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 10px',
          }}
        >
          <span style={{ fontSize: 12, color: colors.textSecondary }}>⌕</span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              onSearch(e.target.value);
            }}
            placeholder="Search"
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: colors.textPrimary,
              fontSize: 13,
              width: '100%',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function iconBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    borderRadius: 12,
    background: 'rgba(255,255,255,0.08)',
    border: '0.5px solid rgba(255,255,255,0.12)',
    color: enabled ? colors.textPrimary : colors.textQuaternary,
    fontSize: 15,
    cursor: enabled ? 'pointer' : 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}
