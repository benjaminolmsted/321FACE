/**
 * Countdown: 3... 2.. 1. FACE.
 * Phase 0–2: numbers. Phase 3: FACE (triggers onFace callback).
 * totalMs configurable; for SNAP mode use short duration (e.g. 400ms).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const COUNTDOWN_TOTAL_MS_DEFAULT = 1250;
export const COUNTDOWN_LABELS = ['3', '2', '1', 'FACE'] as const;
export type CountdownPhase = 0 | 1 | 2 | 3 | null;

type Callbacks = {
  onFace?: () => void;
  onComplete?: () => void;
};

export function useCountdown3251(totalMs = COUNTDOWN_TOTAL_MS_DEFAULT) {
  const [phase, setPhase] = useState<CountdownPhase>(null);
  const callbacksRef = useRef<Callbacks>({});
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const start = useCallback((opts?: Callbacks) => {
    clearTimers();
    callbacksRef.current = opts ?? {};
    const phaseMs = totalMs / 4;
    setPhase(0);

    const push = (id: ReturnType<typeof setTimeout>) => {
      timersRef.current.push(id);
    };

    push(setTimeout(() => setPhase(1), phaseMs));
    push(setTimeout(() => setPhase(2), phaseMs * 2));
    push(
      setTimeout(() => {
        setPhase(3);
        callbacksRef.current.onFace?.();
      }, phaseMs * 3)
    );
    push(
      setTimeout(() => {
        setPhase(null);
        callbacksRef.current.onComplete?.();
        clearTimers();
      }, totalMs)
    );
  }, [clearTimers, totalMs]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    phase,
    label: phase !== null ? COUNTDOWN_LABELS[phase] : null,
    isRunning: phase !== null,
    start,
  };
}
