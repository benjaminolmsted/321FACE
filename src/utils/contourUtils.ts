/**
 * Contour-based face similarity utilities
 * Includes eye-open veto: if eye openness differs by > threshold, that eye's contour score is 0
 */

import type { Face } from '@react-native-ml-kit/face-detection';
import {
  CONTOUR_THRESHOLDS,
  CONTOUR_WEIGHTS,
  EYE_OPEN_VETO_THRESHOLD,
} from './constants';

export type ContourType =
  | 'face'
  | 'leftEye'
  | 'rightEye'
  | 'mouth'
  | 'leftEyebrowTop'
  | 'rightEyebrowTop'
  | 'leftEyebrowBottom'
  | 'rightEyebrowBottom';

const HIGH_WEIGHT_CONTOURS: ContourType[] = [
  'face',
  'leftEye',
  'rightEye',
  'mouth',
  'leftEyebrowTop',
  'rightEyebrowTop',
  'leftEyebrowBottom',
  'rightEyebrowBottom',
];

function pointDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

/** Compute similarity between two contours (0-1, higher = more similar) */
function contourSimilarity(
  pointsA: { x: number; y: number }[],
  pointsB: { x: number; y: number }[]
): number {
  if (pointsA.length !== pointsB.length || pointsA.length === 0) return 0;

  const scaleA = Math.max(
    1,
    pointDistance(pointsA[0], pointsA[pointsA.length - 1]) || 1
  );
  const scaleB = Math.max(
    1,
    pointDistance(pointsB[0], pointsB[pointsB.length - 1]) || 1
  );
  const scale = Math.max(scaleA, scaleB);

  let totalSimilarity = 0;
  for (let i = 0; i < pointsA.length; i++) {
    const d = pointDistance(pointsA[i], pointsB[i]);
    const normalized = 1 - Math.min(1, d / scale);
    totalSimilarity += normalized;
  }
  return totalSimilarity / pointsA.length;
}

/** Apply eye-open veto: if eye openness differs by > threshold, return 0 for that eye */
function applyEyeOpenVeto(
  faceA: Face,
  faceB: Face,
  contourType: ContourType,
  rawSimilarity: number
): number {
  if (contourType !== 'leftEye' && contourType !== 'rightEye') {
    return rawSimilarity;
  }

  const leftA = faceA.leftEyeOpenProbability ?? 0.5;
  const rightA = faceA.rightEyeOpenProbability ?? 0.5;
  const leftB = faceB.leftEyeOpenProbability ?? 0.5;
  const rightB = faceB.rightEyeOpenProbability ?? 0.5;

  if (contourType === 'leftEye') {
    if (Math.abs(leftA - leftB) > EYE_OPEN_VETO_THRESHOLD) return 0;
  } else {
    if (Math.abs(rightA - rightB) > EYE_OPEN_VETO_THRESHOLD) return 0;
  }

  return rawSimilarity;
}

export interface ContourSimilarityResult {
  overall: number;
  perContour: Record<string, number>;
  passed: boolean;
}

export function computeContourSimilarity(
  faceA: Face,
  faceB: Face
): ContourSimilarityResult {
  const contours = faceA.contours && faceB.contours ? faceA.contours : undefined;
  const perContour: Record<string, number> = {
    overall: 0,
  };

  if (!contours) {
    return { overall: 0, perContour: {}, passed: false };
  }

  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of HIGH_WEIGHT_CONTOURS) {
    const contourA = faceA.contours?.[key as keyof typeof faceA.contours];
    const contourB = faceB.contours?.[key as keyof typeof faceB.contours];

    if (!contourA?.points?.length || !contourB?.points?.length) continue;

    const rawSim = contourSimilarity(contourA.points, contourB.points);
    const sim = applyEyeOpenVeto(faceA, faceB, key as ContourType, rawSim);
    const weight = CONTOUR_WEIGHTS[key] ?? 0;

    perContour[key] = sim;
    weightedSum += sim * weight;
    totalWeight += weight;
  }

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // All high-weight contours must pass their threshold
  const passed = HIGH_WEIGHT_CONTOURS.every((key) => {
    const threshold = CONTOUR_THRESHOLDS[key];
    if (threshold === undefined) return true;
    const sim = perContour[key];
    if (sim === undefined) return true;
    return sim >= threshold;
  });

  return { overall, perContour, passed };
}
