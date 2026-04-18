export type StrikeReason = 'similar' | 'tilt' | 'zoom' | 'nfd';

export interface ProcessResult {
  strike: boolean;
  reason?: StrikeReason;
  benchmarks?: {
    blendshapeMs?: number;
  };
  scores?: {
    blendshape?: { minDistance: number; perFace: number[] };
    pose?: { pitchDeg: number; rollDeg: number; yawDeg: number; tiltStrike: boolean };
    interOcular?: { baseline: number; current: number; zoomStrike: boolean };
  };
}
