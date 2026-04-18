/**
 * Game and comparison configuration
 */

/** Max width for saved capture images (height scales to maintain aspect ratio). Smaller = faster export. Default 1080. */
export const CAPTURE_MAX_WIDTH = 1080;

export const GAME_CONFIG = {
  MAX_STRIKES: 3,
  TILT_THRESHOLD_DEGREES: 15,
} as const;

/** Per-mode blendshape threshold and strike limit (used by Baseline and FlowContext) */
export const PLAY_MODE_CONFIG = {
  subtle: { blendshapeThreshold: 0.175, maxStrikes: 3 },
  balanced: { blendshapeThreshold: 0.35, maxStrikes: 3 },
  extreme: { blendshapeThreshold: 0.85, maxStrikes: 1 },
} as const;

export const BLENDSHAPE_DISTANCE_THRESHOLD = 0.225;

/** Strike if inter-ocular distance differs from baseline by more than this fraction (e.g. 0.13 = 13%) */
export const INTER_OCULAR_ZOOM_THRESHOLD = 0.13;
