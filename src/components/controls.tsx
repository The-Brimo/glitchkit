import React from 'react';
import { colors } from '../theme';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6, display: 'block' }}>{children}</label>;
}

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

export function DividerLine({ margin = '16px 0 14px' }: { margin?: string }) {
  return <div style={{ height: 1, background: colors.hairline, margin }} />;
}

export function Footnote({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: colors.textTertiary, fontStyle: 'italic', lineHeight: 1.5, marginTop: 10 }}>{children}</div>;
}

export function Field({ label, children, marginBottom = 14 }: { label: string; children: React.ReactNode; marginBottom?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom }}>
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

const controlBase: React.CSSProperties = {
  height: 30,
  borderRadius: 8,
  border: `1px solid ${colors.hairlineStrong}`,
  fontSize: 13,
  padding: '0 8px',
  background: colors.controlFill,
  color: '#f2f2f7',
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export function SelectField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...controlBase, cursor: 'pointer' }}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NumberField({ value, onChange, onCommit }: { value: number; onChange: (v: number) => void; onCommit?: () => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onBlur={onCommit}
      style={controlBase}
    />
  );
}

export function TextField({
  value,
  onChange,
  onBlur,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onEnter?: () => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onEnter?.();
      }}
      style={controlBase}
    />
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
      <FieldLabel>
        {label} — {value}
        {unit}
      </FieldLabel>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: colors.accent }}
      />
    </div>
  );
}

export function Toggle({ checked, onChange, onColor = colors.enabled }: { checked: boolean; onChange: (v: boolean) => void; onColor?: string }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? onColor : 'rgba(120,120,128,0.32)',
        position: 'relative',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          transition: 'left 0.15s',
        }}
      />
    </div>
  );
}

export function ToggleRow({ label, checked, onChange, onColor }: { label: string; checked: boolean; onChange: (v: boolean) => void; onColor?: string }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: 16 }}
    >
      <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', cursor: 'pointer' }}>{label}</label>
      <Toggle checked={checked} onChange={onChange} onColor={onColor} />
    </div>
  );
}

export function Segmented({ options, value, onChange }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${colors.hairlineStrong}`, marginBottom: 16 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <div
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '7px 0',
              fontSize: 12,
              cursor: 'pointer',
              background: selected ? colors.accent : 'transparent',
              color: selected ? '#fff' : 'rgba(255,255,255,0.6)',
              userSelect: 'none',
            }}
          >
            {o.label}
          </div>
        );
      })}
    </div>
  );
}

export function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        flex: 1,
        height: 38,
        borderRadius: 10,
        background: disabled ? 'rgba(10,132,255,0.4)' : colors.accent,
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        userSelect: 'none',
      }}
    >
      {children}
    </div>
  );
}

export function SecondaryButton({ children, onClick, style }: { children: React.ReactNode; onClick: () => void; style?: React.CSSProperties }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1,
        height: 38,
        borderRadius: 10,
        background: colors.secondaryBtn,
        color: '#f2f2f7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function DestructiveButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        height: 32,
        borderRadius: 8,
        border: `1px solid ${colors.destructiveBorder}`,
        color: colors.destructive,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        userSelect: 'none',
        background: 'transparent',
      }}
    >
      {children}
    </div>
  );
}
