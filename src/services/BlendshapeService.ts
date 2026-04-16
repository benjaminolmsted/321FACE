/**
 * MediaPipe Face Landmarker blendshape extraction.
 * Runs on a static image (IMAGE mode) — no Vision Camera needed.
 */

import { faceLandmarkDetectionOnImage } from 'react-native-mediapipe';

const MODEL = 'face_landmarker.task';

export const BLENDSHAPE_NAMES = [
  '_neutral',
  'browDownLeft',
  'browDownRight',
  'browInnerUp',
  'browOuterUpLeft',
  'browOuterUpRight',
  'cheekPuff',
  'cheekSquintLeft',
  'cheekSquintRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'eyeLookDownLeft',
  'eyeLookDownRight',
  'eyeLookInLeft',
  'eyeLookInRight',
  'eyeLookOutLeft',
  'eyeLookOutRight',
  'eyeLookUpLeft',
  'eyeLookUpRight',
  'eyeSquintLeft',
  'eyeSquintRight',
  'eyeWideLeft',
  'eyeWideRight',
  'jawForward',
  'jawLeft',
  'jawOpen',
  'jawRight',
  'mouthClose',
  'mouthDimpleLeft',
  'mouthDimpleRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'mouthFunnel',
  'mouthLeft',
  'mouthLowerDownLeft',
  'mouthLowerDownRight',
  'mouthPressLeft',
  'mouthPressRight',
  'mouthPucker',
  'mouthRight',
  'mouthRollLower',
  'mouthRollUpper',
  'mouthShrugLower',
  'mouthShrugUpper',
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthStretchLeft',
  'mouthStretchRight',
  'mouthUpperUpLeft',
  'mouthUpperUpRight',
  'noseSneerLeft',
  'noseSneerRight',
] as const;

export type BlendshapeName = (typeof BLENDSHAPE_NAMES)[number];

export interface FacePose {
  pitchDeg: number;
  rollDeg: number;
  yawDeg: number;
}

export interface BlendshapeResult {
  /** 52 blendshape scores in canonical order (0-1 each) */
  scores: number[];
  /** Named map for display/debugging */
  named: Record<string, number>;
  /** Face landmarks (normalized 0-1 relative to source image width/height) */
  faceLandmarks?: { x: number; y: number; z: number }[];
  /** Source image dimensions; landmarks are relative to these */
  sourceImageWidth?: number;
  sourceImageHeight?: number;
  /** Head pose from transformation matrix (degrees) */
  facePose?: FacePose;
  timingMs: number;
}

/** Extract pitch, roll, yaw (degrees) from 4x4 transform matrix (row-major) */
function matrixToEulerDeg(data: number[]): FacePose {
  if (!data || data.length < 12) return { pitchDeg: 0, rollDeg: 0, yawDeg: 0 };
  const r00 = data[0], r01 = data[1], r02 = data[2];
  const r10 = data[4], r11 = data[5], r12 = data[6];
  const r20 = data[8], r21 = data[9], r22 = data[10];

  let thetaX: number, thetaY: number, thetaZ: number;
  if (r10 < 1) {
    if (r10 > -1) {
      thetaZ = Math.asin(r10);
      thetaY = Math.atan2(-r20, r00);
      thetaX = Math.atan2(-r12, r11);
    } else {
      thetaZ = -Math.PI / 2;
      thetaY = -Math.atan2(r21, r22);
      thetaX = 0;
    }
  } else {
    thetaZ = Math.PI / 2;
    thetaY = Math.atan2(r21, r22);
    thetaX = 0;
  }
  const radToDeg = 180 / Math.PI;
  return {
    pitchDeg: -thetaX * radToDeg,
    rollDeg: -thetaZ * radToDeg,
    yawDeg: -thetaY * radToDeg,
  };
}

let _warmedUp = false;

export function isBlendshapeWarmedUp(): boolean {
  return _warmedUp;
}

/**
 * Pre-load the MediaPipe face landmarker model so the first real
 * inference doesn't pay the ~4s model-load cost.
 * Safe to call multiple times — only the first call does work.
 */
export async function warmupBlendshapes(imagePath: string): Promise<void> {
  if (_warmedUp) return;
  try {
    const t0 = performance.now();
    await faceLandmarkDetectionOnImage(imagePath, MODEL, {
      numFaces: 1,
      minFaceDetectionConfidence: 0.1,
      minFacePresenceConfidence: 0.1,
    });
    _warmedUp = true;
  } catch (err) {
    console.warn('[BlendshapeService] warmup failed (non-fatal):', err);
  }
}

export async function extractBlendshapes(
  imagePath: string
): Promise<BlendshapeResult | null> {
  const t0 = performance.now();

  try {
    const result = await faceLandmarkDetectionOnImage(imagePath, MODEL, {
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
    });

    const firstResult = result.results[0];
    if (!firstResult?.faceBlendshapes?.length) return null;

    const categories = firstResult.faceBlendshapes[0]?.categories;
    if (!categories?.length) return null;

    const named: Record<string, number> = {};
    for (const cat of categories) {
      const name = (cat as any).label ?? cat.categoryName;
      if (name) {
        named[name] = cat.score;
      }
    }

    const scores = BLENDSHAPE_NAMES.map((name) => named[name] ?? 0);
    const faceLandmarks = firstResult.faceLandmarks?.[0]?.map((l: { x: number; y: number; z: number }) => ({ x: l.x, y: l.y, z: l.z }));
    const matrices = (firstResult as any).facialTransformationMatrixes;
    const matrixData = matrices?.[0]?.data ?? (Array.isArray(matrices?.[0]) ? matrices[0] : undefined);
    const facePose = matrixData && Array.isArray(matrixData) && matrixData.length >= 12
      ? matrixToEulerDeg(Array.from(matrixData))
      : undefined;
    const timingMs = performance.now() - t0;

    return {
      scores,
      named,
      faceLandmarks,
      sourceImageWidth: result.inputImageWidth,
      sourceImageHeight: result.inputImageHeight,
      facePose,
      timingMs,
    };
  } catch (err) {
    console.error('[BlendshapeService] extraction failed:', err);
    return null;
  }
}

/** Inter-ocular distance from MediaPipe face landmarks (normalized 0–1).
 * Uses landmark indices 33 (left eye) and 263 (right eye). Returns 0 if unavailable. */
export function getInterOcularDistance(landmarks?: { x: number; y: number; z: number }[]): number {
  if (!landmarks || landmarks.length < 264) return 0;
  const left = landmarks[33];
  const right = landmarks[263];
  if (!left || !right) return 0;
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const dz = (right.z ?? 0) - (left.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Euclidean distance between two blendshape vectors */
export function blendshapeDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}
