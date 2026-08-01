import { useEffect, useRef, useState } from 'react';
import { useAppState } from '../store/AppState';
import { useRenderEngine } from '../store/RenderEngine';
import { colors, fontMono } from '../theme';

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export function Canvas() {
  const { dispatch } = useAppState();
  const { resultCanvas, meta, status, lastRenderMs } = useRenderEngine();
  const displayRef = useRef<HTMLCanvasElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    const display = displayRef.current;
    if (!display || !resultCanvas) return;
    const parent = display.parentElement!;

    const draw = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      display.width = Math.round(rect.width * dpr);
      display.height = Math.round(rect.height * dpr);
      const ctx = display.getContext('2d')!;
      ctx.clearRect(0, 0, display.width, display.height);

      const scale = Math.max(display.width / resultCanvas.width, display.height / resultCanvas.height);
      const dw = resultCanvas.width * scale;
      const dh = resultCanvas.height * scale;
      ctx.drawImage(resultCanvas, (display.width - dw) / 2, (display.height - dh) / 2, dw, dh);
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [resultCanvas]);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const dataURL = await readFileAsDataURL(file);
    dispatch({ type: 'SET_FILE', dataURL, name: file.name });
  };

  const needsImage = meta?.needsImage ?? false;
  const statusLabel = status === 'rendering' ? 'rendering…' : status === 'failed' ? 'render failed' : lastRenderMs != null ? `up to date · ${(lastRenderMs / 1000).toFixed(2)}s` : 'up to date';

  const stepErrorMsgs = meta ? Object.values(meta.stepErrors) : [];

  return (
    <div
      style={{
        flex: 1,
        margin: '8px 8px 8px 0',
        borderRadius: 18,
        background: colors.canvasWell,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        minWidth: 0,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div
        style={{
          flex: 1,
          margin: 24,
          borderRadius: 10,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          outline: dragOver ? `2px solid ${colors.accent}` : 'none',
        }}
      >
        {needsImage ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: colors.canvasEmpty,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: fontMono,
              fontSize: 12,
              color: colors.textTertiary,
              textAlign: 'center',
              padding: 20,
            }}
          >
            no source image — choose one in the inspector
            <br />
            (or drop an image here)
          </div>
        ) : (
          <canvas ref={displayRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        )}
      </div>

      <div style={{ position: 'absolute', left: 36, top: 16, fontFamily: fontMono, fontSize: 11, color: colors.textQuaternary }}>
        {statusLabel}
      </div>
      {meta && (
        <div style={{ position: 'absolute', left: 36, bottom: 20, fontFamily: fontMono, fontSize: 11, letterSpacing: '0.02em', color: colors.textSecondary }}>
          {meta.recipeLabel}
        </div>
      )}
      {stepErrorMsgs.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 36,
            bottom: 20,
            fontFamily: fontMono,
            fontSize: 11,
            color: colors.destructive,
            maxWidth: '50%',
            textAlign: 'right',
          }}
        >
          {stepErrorMsgs[0]}
        </div>
      )}
    </div>
  );
}
