import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAppState } from './AppState';
import { runPipeline } from '../pipeline/runner';
import type { Document, SigilParams } from '../types';

interface RenderMeta {
  recipeLabel: string;
  hasImage: boolean;
  needsImage: boolean;
  stepErrors: Record<string, string>;
}

/** Live-sigil playback state, exposed so the panel can draw its buttons. */
interface LiveSigil {
  stepId: string;
  recording: boolean;
  secondsLeft: number | null; // recording countdown; null during plain playback
}

interface RenderEngineValue {
  resultCanvas: HTMLCanvasElement | null;
  meta: RenderMeta | null;
  status: 'idle' | 'rendering' | 'failed';
  lastRenderMs: number | null;
  renderFull: () => Promise<HTMLCanvasElement | null>;
  liveSigil: LiveSigil | null;
  startLiveSigil: (stepId: string, record?: boolean) => void;
  stopLiveSigil: () => void;
}

const RenderEngineContext = createContext<RenderEngineValue | null>(null);

const DEBOUNCE_MS = 220;
const MIN_FRAME_MS = 33; // don't melt the CPU when the chain renders fast

function withPhase(doc: Document, stepId: string, phase: number): Document {
  return {
    ...doc,
    chain: doc.chain.map((s) =>
      s.id === stepId ? { ...s, params: { ...s.params, phase } as SigilParams } : s
    ),
  };
}

function pickRecorderMime(): { mime: string; ext: string } | null {
  const candidates: [string, string][] = [
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
  ];
  for (const [mime, ext] of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export function RenderEngineProvider({ children }: { children: React.ReactNode }) {
  const { doc, dispatch } = useAppState();
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [meta, setMeta] = useState<RenderMeta | null>(null);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'failed'>('idle');
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null);
  const [liveSigil, setLiveSigil] = useState<LiveSigil | null>(null);

  const runIdRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const docRef = useRef<Document>(doc);
  docRef.current = doc;
  // The live loop's cancellation token. A new loop (or a stop) replaces it.
  const liveRef = useRef<{ stepId: string; cancelled: boolean } | null>(null);

  useEffect(() => {
    // Live playback renders on its own clock; the debounced doc-render would
    // only fight it for the canvas (its loop re-reads the doc every frame, so
    // slider tweaks still land).
    if (liveRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const myRun = ++runIdRef.current;
      setStatus('rendering');
      const t0 = performance.now();
      try {
        const result = await runPipeline(docRef.current, { quality: 'preview', maxPreviewDim: 900 });
        if (myRun !== runIdRef.current) return;
        setResultCanvas(result.canvas);
        setMeta({ recipeLabel: result.recipeLabel, hasImage: result.hasImage, needsImage: result.needsImage, stepErrors: result.stepErrors });
        setLastRenderMs(performance.now() - t0);
        setStatus('idle');
      } catch {
        if (myRun !== runIdRef.current) return;
        setStatus('failed');
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [doc]);

  const stopLiveSigil = () => {
    const live = liveRef.current;
    if (!live) return;
    live.cancelled = true;
    liveRef.current = null;
    setLiveSigil(null);
  };

  /**
   * Self-paced playback: phase runs off the wall clock (one cycle per
   * `period` seconds), each frame rendered as fast as the chain allows and
   * never faster than ~30fps. With `record`, an offscreen canvas mirrors the
   * frames into a MediaRecorder for exactly one period, then downloads a
   * seamlessly looping video. On stop, the current phase is committed to the
   * document as one undo entry, so the still you land on is the one you saw.
   */
  const startLiveSigil = (stepId: string, record = false) => {
    stopLiveSigil();
    const token = { stepId, cancelled: false };
    liveRef.current = token;
    runIdRef.current++; // orphan any in-flight debounce render
    window.clearTimeout(timerRef.current);
    setLiveSigil({ stepId, recording: record, secondsLeft: null });

    const loop = async () => {
      const startStep = docRef.current.chain.find((s) => s.id === stepId && s.type === 'sigil');
      if (!startStep) return stopLiveSigil();
      const p0 = startStep.params as SigilParams;
      const basePhase = ((p0.phase % 100) + 100) % 100;
      const periodMs = Math.max(2, Math.min(60, p0.period || 12)) * 1000;
      const t0 = performance.now();
      let lastPhase = basePhase;

      let recorder: MediaRecorder | null = null;
      let recCanvas: HTMLCanvasElement | null = null;
      let recCtx: CanvasRenderingContext2D | null = null;
      let recDone: Promise<Blob> | null = null;
      let recExt = 'webm';

      while (!token.cancelled) {
        const stepNow = docRef.current.chain.find((s) => s.id === stepId && s.type === 'sigil');
        if (!stepNow) break;
        const elapsed = performance.now() - t0;
        lastPhase = (basePhase + (elapsed / periodMs) * 100) % 100;

        const frameT0 = performance.now();
        let canvas: HTMLCanvasElement;
        try {
          const result = await runPipeline(withPhase(docRef.current, stepId, lastPhase), {
            quality: 'preview',
            maxPreviewDim: 900,
          });
          canvas = result.canvas;
          if (token.cancelled) break;
          setResultCanvas(canvas);
          setMeta({ recipeLabel: result.recipeLabel, hasImage: result.hasImage, needsImage: result.needsImage, stepErrors: result.stepErrors });
          setLastRenderMs(performance.now() - frameT0);
        } catch {
          break;
        }

        if (record) {
          if (!recorder) {
            const picked = pickRecorderMime();
            if (!picked) break; // no MediaRecorder support; bail to plain stop
            recExt = picked.ext;
            recCanvas = document.createElement('canvas');
            recCanvas.width = canvas.width;
            recCanvas.height = canvas.height;
            recCtx = recCanvas.getContext('2d')!;
            recCtx.drawImage(canvas, 0, 0, recCanvas.width, recCanvas.height);
            const stream = recCanvas.captureStream(30);
            recorder = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 12_000_000 });
            const chunks: Blob[] = [];
            recDone = new Promise<Blob>((resolve) => {
              recorder!.ondataavailable = (e) => e.data.size && chunks.push(e.data);
              recorder!.onstop = () => resolve(new Blob(chunks, { type: picked.mime.split(';')[0] }));
            });
            recorder.start();
          } else {
            recCtx!.drawImage(canvas, 0, 0, recCanvas!.width, recCanvas!.height);
          }
          const remaining = periodMs - (performance.now() - t0);
          setLiveSigil({ stepId, recording: true, secondsLeft: Math.max(0, Math.ceil(remaining / 1000)) });
          if (remaining <= 0) break; // one full loop captured
        }

        // ALWAYS yield a macrotask: runPipeline can resolve entirely in
        // microtasks on a sync chain, and a while-loop that never reaches the
        // event loop freezes paints, input, and React itself.
        const frameMs = performance.now() - frameT0;
        await new Promise((r) => setTimeout(r, Math.max(0, MIN_FRAME_MS - frameMs)));
      }

      if (recorder && recDone) {
        recorder.stop();
        const blob = await recDone;
        // A cancelled recording is an abort: a partial cycle wouldn't loop.
        if (!token.cancelled) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `glitchkit-sigil-loop.${recExt}`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        }
      }

      // Commit where the animation landed, one undo entry, so the document
      // matches the last frame on screen.
      if (liveRef.current === token) {
        liveRef.current = null;
        setLiveSigil(null);
      }
      if (docRef.current.chain.some((s) => s.id === stepId && s.type === 'sigil')) {
        dispatch({ type: 'PATCH_STEP_PARAM', id: stepId, key: 'phase', value: Math.round(lastPhase * 100) / 100, historyKey: 'sigilphase' });
      }
    };
    void loop();
  };

  const renderFull = async (): Promise<HTMLCanvasElement | null> => {
    const myRun = ++runIdRef.current;
    setStatus('rendering');
    const t0 = performance.now();
    try {
      const result = await runPipeline(docRef.current, { quality: 'full' });
      if (myRun !== runIdRef.current) return result.canvas;
      setResultCanvas(result.canvas);
      setMeta({ recipeLabel: result.recipeLabel, hasImage: result.hasImage, needsImage: result.needsImage, stepErrors: result.stepErrors });
      setLastRenderMs(performance.now() - t0);
      setStatus('idle');
      return result.canvas;
    } catch {
      setStatus('failed');
      return null;
    }
  };

  return (
    <RenderEngineContext.Provider
      value={{ resultCanvas, meta, status, lastRenderMs, renderFull, liveSigil, startLiveSigil, stopLiveSigil }}
    >
      {children}
    </RenderEngineContext.Provider>
  );
}

export function useRenderEngine(): RenderEngineValue {
  const ctx = useContext(RenderEngineContext);
  if (!ctx) throw new Error('useRenderEngine must be used within RenderEngineProvider');
  return ctx;
}
