/**
 * Game and comparison configuration
 */

export const GAME_CONFIG = {
  MAX_STRIKES: 3,
  TILT_THRESHOLD_DEGREES: 20,
} as const;

export const COMPARISON_STRATEGIES = ['contour', 'embedding'] as const;
export type ComparisonStrategyType = (typeof COMPARISON_STRATEGIES)[number];

export const FACE_NET_SIMILARITY_THRESHOLD = 0.65;

/** Per-contour similarity thresholds (must pass to avoid strike) */
export const CONTOUR_THRESHOLDS: Record<string, number> = {
  face: 0.975,
  leftEye: 0.975,
  rightEye: 0.975,
  mouth: 0.975,
  leftEyebrowTop: 0.975,
  rightEyebrowTop: 0.975,
  leftEyebrowBottom: 0.975,
  rightEyebrowBottom: 0.975,
};

/** Contour weights for similarity scoring */
export const CONTOUR_WEIGHTS: Record<string, number> = {
  face: 0.25,
  leftEye: 0.15,
  rightEye: 0.15,
  mouth: 0.15,
  leftEyebrowTop: 0.05,
  rightEyebrowTop: 0.05,
  leftEyebrowBottom: 0.05,
  rightEyebrowBottom: 0.05,
};

export const EYE_OPEN_VETO_THRESHOLD = 0.4;
