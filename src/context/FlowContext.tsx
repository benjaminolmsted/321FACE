/**
 * Phase-based flow controller. Single source of truth for app state; advance() is the only way to transition.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import type { BaselineProcessResult } from '../services/BaselineCaptureService';
import type { StrikeDetail } from '../screens/GameOverScreen';
import { PLAY_MODE_CONFIG } from '../utils/constants';

export type PlayMode = 'subtle' | 'balanced' | 'extreme';

// ---------------------------------------------------------------------------
// Phase types
// ---------------------------------------------------------------------------

export type BaselinePhase = 'capture' | 'flash' | 'error';
export type GamePhase = 'countdown' | 'playing' | 'processing' | 'resultFlash' | 'strike' | 'debug' | 'gameOver';

export type BaselinePhaseData =
  | { kind: 'flash'; displayUri: string; processing: Promise<BaselineProcessResult> }
  | { kind: 'error'; message: string; debugImageUri?: string };

export type GameStyle = '321face' | 'snap';

export type GameParams = {
  playMode: boolean;
  blendshapeThreshold: number;
  maxStrikes: number;
  countdownMs: number;
  gameStyle: GameStyle;
};

export type GamePhaseData =
  | { kind: 'resultFlash'; imageUri: string; label: 'TILT' | 'ZOOM' | 'SAME' | null; strike: boolean; pendingGameOver: boolean; tempPathToCleanup: string }
  | { kind: 'strike'; strikeHistory: StrikeDetail[]; strikes: number }
  | { kind: 'debug'; captureData: unknown }
  | { kind: 'gameOver'; allFaceUris: string[]; strikeHistory: StrikeDetail[]; totalFaces: number };

export type BaselineCapturedData = {
  imageUri: string;
  gameParams: GameParams;
  faceLandmarks?: { x: number; y: number; z: number }[];
  sourceImageWidth?: number;
  sourceImageHeight?: number;
};

export type FlowPhase =
  | { screen: 'home' }
  | { screen: 'baseline'; phase: BaselinePhase; data?: BaselinePhaseData; gameParams: GameParams }
  | { screen: 'gameLoading'; data: BaselineCapturedData }
  | { screen: 'game'; phase: GamePhase; data?: GamePhaseData; gameParams: GameParams; baselineImageUri?: string };

/** Build game params from home play action (used when advancing to baseline) */
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
};

const FlowContext = createContext<FlowContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function FlowProvider({ children }: { children: React.ReactNode }) {
  const [flowPhase, setFlowPhase] = useState<FlowPhase>({ screen: 'home' });
  const advance = useCallback((next: FlowPhase) => {
    setFlowPhase(next);
  }, []);
  return (
    <FlowContext.Provider value={{ flowPhase, advance }}>
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error('useFlow must be used within FlowProvider');
  return ctx;
}
