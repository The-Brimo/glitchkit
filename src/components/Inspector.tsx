import { useAppState } from '../store/AppState';
import { useRenderEngine } from '../store/RenderEngine';
import { colors } from '../theme';
import { SourcePanel } from './SourcePanel';
import { TransformPanel } from './TransformPanel';
import { DividerLine, PrimaryButton, SecondaryButton } from './controls';

function makeThumb(canvas: HTMLCanvasElement | null): string {
  if (!canvas) return '';
  const c = document.createElement('canvas');
  c.width = 104;
  c.height = 80;
  const ctx = c.getContext('2d')!;
  const scale = Math.max(c.width / canvas.width, c.height / canvas.height);
  const dw = canvas.width * scale;
  const dh = canvas.height * scale;
  ctx.drawImage(canvas, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  return c.toDataURL('image/png');
}

export function Inspector() {
  const { doc, dispatch, selection } = useAppState();
  const { resultCanvas, renderFull, status } = useRenderEngine();

  const selectedStep = selection === 'source' ? null : doc.chain.find((s) => s.id === selection.step) || null;

  return (
    <div
      style={{
        width: 300,
        flexShrink: 0,
        margin: '8px 8px 8px 0',
        borderRadius: 18,
        background: colors.panelGlass,
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: `0.5px solid ${colors.hairline}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px 0' }}>
        {selectedStep ? <TransformPanel step={selectedStep} /> : <SourcePanel />}
      </div>

      <div style={{ padding: '0 18px 18px', flexShrink: 0 }}>
        <DividerLine margin="0 0 14px" />
        <div style={{ display: 'flex', gap: 8 }}>
          <SecondaryButton onClick={() => dispatch({ type: 'TAKE_SNAPSHOT', thumb: makeThumb(resultCanvas) })}>Snapshot</SecondaryButton>
          <PrimaryButton disabled={status === 'rendering'} onClick={() => renderFull()}>
            {status === 'rendering' ? 'Rendering…' : 'Render'}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
