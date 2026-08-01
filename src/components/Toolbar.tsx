import { useState } from 'react';
import { useAppState } from '../store/AppState';
import { useRenderEngine } from '../store/RenderEngine';
import { exportImage } from '../pipeline/exportImage';
import { colors } from '../theme';

export function Toolbar({ onSearch }: { onSearch: (q: string) => void }) {
  const { doc, undo, redo, canUndo, canRedo } = useAppState();
  const { renderFull, status } = useRenderEngine();
  const [query, setQuery] = useState('');
  const [exporting, setExporting] = useState(false);

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
    <div style={{ height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 16px', justifyContent: 'space-between' }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.textPrimary }}>glitchkit — basegen</div>
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
