/**
 * Game and comparison configuration
 */

/** Max width for saved capture images (height scales to maintain aspect ratio). Smaller = faster export. Default 1080. */
export const CAPTURE_MAX_WIDTH = 1080;

export const GAME_CONFIG = {
  MAX_STRIKES: 3,
  TILT_THRESHOLD_DEGREES: 15,
} as const;

export const COMPARISON_STRATEGIES: readonly string[] = [];
export type ComparisonStrategyType = 'contour' | 'embedding';

export const BLENDSHAPE_DISTANCE_THRESHOLD = 0.225;

/** Strike if inter-ocular distance differs from baseline by more than this fraction (e.g. 0.10 = 10%) */
export const INTER_OCULAR_ZOOM_THRESHOLD = 0.1;

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
