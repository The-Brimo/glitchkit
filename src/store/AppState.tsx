import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { Document, Selection, StepType } from '../types';
import { createDefaultDocument, nextStepId } from './defaultDocument';
import { docReducer, type DocAction } from './reducer';

interface HistoryState {
  past: Document[];
  present: Document;
  future: Document[];
}

const COALESCE_WINDOW_MS = 700;
const MAX_HISTORY = 200;

interface AppStateValue {
  doc: Document;
  dispatch: (action: DocAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  selection: Selection;
  setSelection: (s: Selection) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;

  addStep: (type: StepType) => void;
  removeStep: (id: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<HistoryState>(() => ({
    past: [],
    present: createDefaultDocument(),
    future: [],
  }));
  const lastKeyRef = useRef<string | undefined>(undefined);
  const lastTimeRef = useRef<number>(0);

  const [selection, setSelection] = useState<Selection>('source');
  const [dragId, setDragId] = useState<string | null>(null);

  const dispatch = useCallback((action: DocAction) => {
    setHistory((h) => {
      const next = docReducer(h.present, action);
      if (next === h.present) return h;

      const key = 'historyKey' in action ? action.historyKey : undefined;
      const now = Date.now();
      const canCoalesce = !!key && key === lastKeyRef.current && now - lastTimeRef.current < COALESCE_WINDOW_MS;

      lastKeyRef.current = key;
      lastTimeRef.current = now;

      if (canCoalesce) {
        return { ...h, present: next };
      }
      const past = [...h.past, h.present].slice(-MAX_HISTORY);
      return { past, present: next, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const present = h.past[h.past.length - 1];
      const past = h.past.slice(0, -1);
      lastKeyRef.current = undefined;
      return { past, present, future: [h.present, ...h.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const present = h.future[0];
      const future = h.future.slice(1);
      lastKeyRef.current = undefined;
      return { past: [...h.past, h.present], present, future };
    });
  }, []);

  const addStep = useCallback(
    (type: StepType) => {
      const id = nextStepId();
      dispatch({ type: 'ADD_STEP', id, stepType: type });
      setSelection({ step: id });
    },
    [dispatch]
  );

  const removeStep = useCallback(
    (id: string) => {
      dispatch({ type: 'REMOVE_STEP', id });
      setSelection((sel) => (sel !== 'source' && sel.step === id ? 'source' : sel));
    },
    [dispatch]
  );

  const value = useMemo<AppStateValue>(
    () => ({
      doc: history.present,
      dispatch,
      undo,
      redo,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      selection,
      setSelection,
      dragId,
      setDragId,
      addStep,
      removeStep,
    }),
    [history, dispatch, undo, redo, selection, dragId, addStep, removeStep]
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
