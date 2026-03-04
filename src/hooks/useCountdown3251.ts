/**
 * Countdown: 3... 2.. 1. FACE over 1.25 seconds.
 * Phase 0–2: numbers. Phase 3: FACE (triggers onFace callback).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export const COUNTDOWN_TOTAL_MS = 1250;
const PHASE_MS = COUNTDOWN_TOTAL_MS / 4;

export const COUNTDOWN_LABELS = ['3...', '2..', '1.', 'FACE'] as const;
export type CountdownPhase = 0 | 1 | 2 | 3 | null;

type Callbacks = {
  onFace?: () => void;
  onComplete?: () => void;
};

export function useCountdown3251() {
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
    setPhase(0);

    const push = (id: ReturnType<typeof setTimeout>) => {
      timersRef.current.push(id);
    };

    push(setTimeout(() => setPhase(1), PHASE_MS));
    push(setTimeout(() => setPhase(2), PHASE_MS * 2));
    push(
      setTimeout(() => {
        setPhase(3);
        callbacksRef.current.onFace?.();
      }, PHASE_MS * 3)
    );
    push(
      setTimeout(() => {
        setPhase(null);
        callbacksRef.current.onComplete?.();
        clearTimers();
      }, COUNTDOWN_TOTAL_MS)
    );
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    phase,
    label: phase !== null ? COUNTDOWN_LABELS[phase] : null,
    isRunning: phase !== null,
    start,
  };
}
