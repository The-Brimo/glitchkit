import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAppState } from './AppState';
import { runPipeline } from '../pipeline/runner';
import type { Document } from '../types';

interface RenderMeta {
  recipeLabel: string;
  hasImage: boolean;
  needsImage: boolean;
  stepErrors: Record<string, string>;
}

interface RenderEngineValue {
  resultCanvas: HTMLCanvasElement | null;
  meta: RenderMeta | null;
  status: 'idle' | 'rendering' | 'failed';
  lastRenderMs: number | null;
  renderFull: () => Promise<HTMLCanvasElement | null>;
}

const RenderEngineContext = createContext<RenderEngineValue | null>(null);

const DEBOUNCE_MS = 220;

export function RenderEngineProvider({ children }: { children: React.ReactNode }) {
  const { doc } = useAppState();
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [meta, setMeta] = useState<RenderMeta | null>(null);
  const [status, setStatus] = useState<'idle' | 'rendering' | 'failed'>('idle');
  const [lastRenderMs, setLastRenderMs] = useState<number | null>(null);

  const runIdRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const docRef = useRef<Document>(doc);
  docRef.current = doc;

  useEffect(() => {
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
    <RenderEngineContext.Provider value={{ resultCanvas, meta, status, lastRenderMs, renderFull }}>{children}</RenderEngineContext.Provider>
  );
}

export function useRenderEngine(): RenderEngineValue {
  const ctx = useContext(RenderEngineContext);
  if (!ctx) throw new Error('useRenderEngine must be used within RenderEngineProvider');
  return ctx;
}
