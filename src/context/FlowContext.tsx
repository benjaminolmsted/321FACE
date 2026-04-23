/**
 * Phase-based flow controller. Single source of truth for app state; advance() is the only way to transition.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { StrikeDetail } from '../screens/GameOverScreen';
import { PLAY_MODE_CONFIG } from '../utils/constants';

export type PlayMode = 'subtle' | 'balanced' | 'extreme';

export type GameStyle = '321face' | 'snap';

export type GameParams = {
  playMode: boolean;
  blendshapeThreshold: number;
  maxStrikes: number;
  countdownMs: number;
  gameStyle: GameStyle;
};

export type FlowPhase =
  | { screen: 'home' }
  | { screen: 'game'; gameParams: GameParams };

/** Build game params from home play action (used when advancing to game) */
export function buildGameParams(
  mode: PlayMode,
  countdownMs: number,
  isDebug: boolean,
  gameStyle: GameStyle
): GameParams {
  const config = PLAY_MODE_CONFIG[mode];
  return {
    playMode: !isDebug,
    blendshapeThreshold: isDebug ? 0.3 : config.blendshapeThreshold,
    maxStrikes: isDebug ? 3 : config.maxStrikes,
    countdownMs,
    gameStyle,
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type FlowContextValue = {
  flowPhase: FlowPhase;
  advance: (next: FlowPhase) => void;
  /** Incremented on every navigation to `home` so home UI (e.g. high score) can refresh without relying on remount. */
  homeDataVersion: number;
};

const FlowContext = createContext<FlowContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flowPhase, setFlowPhase] = useState<FlowPhase>({ screen: 'home' });
  const [homeDataVersion, setHomeDataVersion] = useState(0);
  const advance = useCallback((next: FlowPhase) => {
    if (next.screen === 'home') {
      setHomeDataVersion((v) => v + 1);
    }
    setFlowPhase(next);
  }, []);
  return (
    <FlowContext.Provider value={{ flowPhase, advance, homeDataVersion }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used within FlowProvider');
  return ctx;
}
