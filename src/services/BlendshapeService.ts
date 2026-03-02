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

export interface BlendshapeResult {
  /** 52 blendshape scores in canonical order (0-1 each) */
  scores: number[];
  /** Named map for display/debugging */
  named: Record<string, number>;
  timingMs: number;
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
      if (cat.categoryName) {
        named[cat.categoryName] = cat.score;
      }
    }

    const scores = BLENDSHAPE_NAMES.map((name) => named[name] ?? 0);
    const timingMs = performance.now() - t0;

    return { scores, named, timingMs };
  } catch (err) {
    console.error('[BlendshapeService] extraction failed:', err);
    return null;
  }
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
