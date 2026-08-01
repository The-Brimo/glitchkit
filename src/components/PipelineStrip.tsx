import { useAppState } from '../store/AppState';
import { STEP_LABELS, ADD_TRANSFORM_OPTIONS } from '../pipeline/stepTypes';
import { colors } from '../theme';
import { Toggle } from './controls';
import type { StepType } from '../types';

export function PipelineStrip() {
  const { doc, dispatch, selection, setSelection, dragId, setDragId, addStep, removeStep } = useAppState();

  const sourceLabel = doc.sourceMode === 'imported' ? 'Source Image' : 'Generate';
  const isSourceSelected = selection === 'source';

  return (
    <div style={{ height: 64, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px 14px', overflowX: 'auto' }}>
      <Chip
        label={sourceLabel}
        selected={isSourceSelected}
        removable={false}
        draggable={false}
        onClick={() => setSelection('source')}
      />
      <Sep />

      {doc.chain.map((step, i) => (
        <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Chip
            label={STEP_LABELS[step.type]}
            selected={selection !== 'source' && selection.step === step.id}
            removable
            draggable
            enabled={step.enabled}
            onClick={() => setSelection({ step: step.id })}
            onToggle={() => dispatch({ type: 'PATCH_STEP', id: step.id, patch: { enabled: !step.enabled } })}
            onRemove={() => removeStep(step.id)}
            onDragStart={() => setDragId(step.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId) dispatch({ type: 'MOVE_STEP', fromId: dragId, toId: step.id });
              setDragId(null);
            }}
          />
          {i < doc.chain.length - 1 && <Sep />}
        </div>
      ))}

      <AddTransform onAdd={addStep} />
    </div>
  );
}

function Sep() {
  return <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: 14, flexShrink: 0 }}>→</span>;
}

function Chip({
  label,
  selected,
  removable,
  draggable,
  enabled = true,
  onClick,
  onToggle,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  label: string;
  selected: boolean;
  removable: boolean;
  draggable: boolean;
  enabled?: boolean;
  onClick: () => void;
  onToggle?: () => void;
  onRemove?: () => void;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 12,
        background: selected ? colors.accentSoft : 'rgba(255,255,255,0.06)',
        border: `1px solid ${selected ? colors.accentBorder : 'rgba(255,255,255,0.1)'}`,
        opacity: removable && !enabled ? 0.45 : 1,
        cursor: draggable ? 'grab' : 'pointer',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: !removable || enabled ? colors.enabledDot : 'rgba(255,255,255,0.3)' }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>{label}</span>
      {removable && (
        <div onClick={(e) => e.stopPropagation()} title="enable / bypass">
          <Toggle checked={enabled} onChange={() => onToggle?.()} />
        </div>
      )}
      {removable && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          title="remove"
          style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, lineHeight: 1, color: 'rgba(255,255,255,0.4)' }}
        >
          ×
        </div>
      )}
    </div>
  );
}

function AddTransform({ onAdd }: { onAdd: (type: StepType) => void }) {
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as StepType);
      }}
      style={{
        flexShrink: 0,
        height: 34,
        borderRadius: 12,
        border: '1px dashed rgba(255,255,255,0.25)',
        background: 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        padding: '0 10px',
      }}
    >
      <option value="">+ Add transform</option>
      {ADD_TRANSFORM_OPTIONS.map((o) => (
        <option key={o.type} value={o.type}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
