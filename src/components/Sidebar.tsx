import { useAppState } from '../store/AppState';
import { STEP_LABELS } from '../pipeline/stepTypes';
import { colors, fontMono } from '../theme';

export function Sidebar({ search = '' }: { search?: string }) {
  const { doc, selection, setSelection, dispatch } = useAppState();

  const sourceLabel = doc.sourceMode === 'imported' ? 'Source Image' : 'Generate';
  const isSourceSelected = selection === 'source';

  // The toolbar search field scopes the snapshot grid (per the design spec).
  const query = search.trim().toLowerCase();
  const visibleSnapshots = query
    ? doc.snapshots.filter((s) => s.label.toLowerCase().includes(query) || s.title.toLowerCase().includes(query))
    : doc.snapshots;

  return (
    <div
      style={{
        width: 220,
        flexShrink: 0,
        margin: 8,
        marginRight: 0,
        borderRadius: 18,
        background: colors.sidebarGlass,
        backdropFilter: 'blur(50px)',
        WebkitBackdropFilter: 'blur(50px)',
        border: '0.5px solid rgba(255,255,255,0.10)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 38, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '0 0 0 20px' }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors.trafficRed }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors.trafficYellow }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: colors.trafficGreen }} />
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, padding: '14px 18px 5px' }}>Pipeline</div>

      <div style={{ padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <PipelineRow
          label={sourceLabel}
          selected={isSourceSelected}
          opacity={1}
          onClick={() => setSelection('source')}
        />
        {doc.chain.map((step) => (
          <PipelineRow
            key={step.id}
            label={STEP_LABELS[step.type]}
            selected={selection !== 'source' && selection.step === step.id}
            opacity={step.enabled ? 1 : 0.45}
            onClick={() => setSelection({ step: step.id })}
          />
        ))}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSecondary, padding: '18px 18px 5px' }}>Snapshots</div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 14px', display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
        {doc.snapshots.length === 0 && (
          <div style={{ fontSize: 10, color: colors.textQuaternary, lineHeight: 1.5 }}>
            No snapshots yet — hit Snapshot to keep a result with its settings.
          </div>
        )}
        {doc.snapshots.length > 0 && visibleSnapshots.length === 0 && (
          <div style={{ fontSize: 10, color: colors.textQuaternary, lineHeight: 1.5 }}>No snapshots match “{search.trim()}”.</div>
        )}
        {visibleSnapshots.map((snap) => (
          <div
            key={snap.id}
            title={snap.title}
            onClick={() => dispatch({ type: 'RESTORE_SNAPSHOT', id: snap.id })}
            style={{ width: 52, cursor: 'pointer' }}
          >
            <div
              style={{
                width: 52,
                height: 40,
                borderRadius: 6,
                backgroundImage: `url(${snap.thumb})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: '0 0 0 1px rgba(255,255,255,0.12)',
              }}
            />
            <div style={{ fontSize: 9, color: colors.textTertiary, marginTop: 3, textAlign: 'center', fontFamily: fontMono }}>
              {snap.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineRow({
  label,
  selected,
  opacity,
  onClick,
}: {
  label: string;
  selected: boolean;
  opacity: number;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        height: 24,
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '0 8px',
        cursor: 'pointer',
        background: selected ? 'rgba(255,255,255,0.14)' : 'transparent',
        opacity,
      }}
    >
      <div
        style={{
          width: 14,
          height: 14,
          minWidth: 14,
          borderRadius: '50%',
          background: selected ? colors.accent : 'rgba(255,255,255,0.5)',
        }}
      />
      <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
    </div>
  );
}
