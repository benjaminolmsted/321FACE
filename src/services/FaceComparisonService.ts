import type { Face } from '@react-native-ml-kit/face-detection';
import { COMPARISON_STRATEGIES } from '../utils/constants';
import type { CompareContext, ComparisonResult } from './strategies/types';
import { ContourComparisonStrategy } from './strategies/ContourComparisonStrategy';
import { EmbeddingComparisonStrategy } from './strategies/EmbeddingComparisonStrategy';
import type { StoredFaceData } from './StorageService';

const strategies = {
  contour: new ContourComparisonStrategy(),
  embedding: new EmbeddingComparisonStrategy(),
};

export type StrikeReason = 'similar' | 'tilt' | 'zoom';

export interface ProcessResult {
  strike: boolean;
  reason?: StrikeReason;
  /** Benchmarks in ms */
  benchmarks?: {
    mlKitMs: number;
    faceNetMs?: { align: number; convertRgb: number; modelRun: number; total: number };
    contourMs?: number;
    embeddingMs?: number;
    blendshapeMs?: number;
  };
  /** Similarity scores used for strike decision */
  scores?: {
    contour?: { overall: number; perContour: Record<string, number> };
    embedding?: { maxSimilarity: number; perFace: number[] };
    blendshape?: { minDistance: number; perFace: number[] };
    pose?: { pitchDeg: number; rollDeg: number; yawDeg: number; tiltStrike: boolean };
    interOcular?: { baseline: number; current: number; zoomStrike: boolean };
  };
}

export async function processCapturedFace(
  currentFace: Face,
  currentImageUri: string,
  currentEmbedding: number[] | undefined,
  previousFaces: StoredFaceData[],
  benchmarks?: ProcessResult['benchmarks']
): Promise<ProcessResult> {
  const context: CompareContext = {
    currentFace,
    currentImageUri,
    currentEmbedding,
    previousFaces: previousFaces.map((f) => ({
      face: f.face,
      imageUri: f.imageUri,
      embedding: f.embedding,
    })),
  };

  const scores: ProcessResult['scores'] = {};
  const mergedBenchmarks = benchmarks ? { ...benchmarks } : undefined;
  const strikeResults: Array<{ name: string; result: ComparisonResult }> = [];

  for (const name of COMPARISON_STRATEGIES) {
    const strategy = strategies[name as keyof typeof strategies];
    if (!strategy) continue;

    const result: ComparisonResult = await strategy.compare(context);

    if (result.contourScores) scores.contour = result.contourScores;
    if (result.embeddingScores) scores.embedding = result.embeddingScores;

    if (mergedBenchmarks) {
      if (result.timingMs !== undefined && name === 'contour') mergedBenchmarks.contourMs = result.timingMs;
      if (result.timingMs !== undefined && name === 'embedding') mergedBenchmarks.embeddingMs = result.timingMs;
      if (result.faceNetTimingMs && name === 'embedding') mergedBenchmarks.faceNetMs = result.faceNetTimingMs;
    }

    strikeResults.push({ name, result });
  }

  // Require ALL strategies to strike (AND logic). FaceNet encodes identity, not expression,
  // so same person with different face/expression would incorrectly strike on embedding alone.
  // Contour compares geometry (expression); both must agree for a true "same face" strike.
  const allStrike = strikeResults.every(({ result }) => result.strike);
  const tiltStrike = strikeResults.some(({ result }) => result.reason === 'tilt');

  if (tiltStrike || allStrike) {
    const reason = tiltStrike ? 'tilt' : 'similar';
    return {
      strike: true,
      reason,
      benchmarks: mergedBenchmarks,
      scores,
    };
  }

  return { strike: false, benchmarks: mergedBenchmarks, scores };
}
