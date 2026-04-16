/**
 * Countdown hook with configurable number of pre-capture phases.
 *
 * 321face mode (prePhases=3, totalMs=1252):  3 → 2 → 1 → FACE  (313ms each)
 * Snap mode    (prePhases=1, totalMs=626):   (silent) → SNAP    (313ms each)
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const COUNTDOWN_321_MS = 1252;
export const COUNTDOWN_SNAP_MS = 626;
export const COUNTDOWN_LABELS = ['3', '2', '1', 'FACE'] as const;

type Callbacks = {
  onFace?: () => void;
  onComplete?: () => void;
};

export function useCountdown3251(totalMs: number, prePhases = 3) {
  const totalPhases = prePhases + 1;
  const facePhase = prePhases;
  const [phase, setPhase] = useState<number | null>(null);
  const callbacksRef = useRef<Callbacks>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const start = useCallback((opts?: Callbacks) => {
    clearTimers();
    callbacksRef.current = opts ?? {};
    const phaseMs = totalMs / totalPhases;
    setPhase(0);

    const push = (id: ReturnType<typeof setTimeout>) => {
      timersRef.current.push(id);
    };

    for (let p = 1; p < facePhase; p++) {
      const target = p;
      push(setTimeout(() => setPhase(target), phaseMs * p));
    }

    push(
      setTimeout(() => {
        setPhase(facePhase);
        callbacksRef.current.onFace?.();
      }, phaseMs * facePhase)
    );
  }, [clearTimers, totalMs, totalPhases, facePhase]);

  const clear = useCallback(() => {
    clearTimers();
    setPhase(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const label = phase !== null && phase < COUNTDOWN_LABELS.length
    ? COUNTDOWN_LABELS[phase]
    : null;

  return {
    phase,
    facePhase,
    label,
    isRunning: phase !== null,
    start,
    clear,
  };
}
