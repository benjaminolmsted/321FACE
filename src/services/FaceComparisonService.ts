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

export type StrikeReason = 'similar' | 'tilt';

export interface ProcessResult {
  strike: boolean;
  reason?: StrikeReason;
}

export async function processCapturedFace(
  currentFace: Face,
  currentImageUri: string,
  currentEmbedding: number[] | undefined,
  previousFaces: StoredFaceData[]
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

  for (const name of COMPARISON_STRATEGIES) {
    const strategy = strategies[name as keyof typeof strategies];
    if (!strategy) continue;

    const result: ComparisonResult = await strategy.compare(context);
    if (result.strike) {
      return {
        strike: true,
        reason: result.reason === 'tilt' ? 'tilt' : 'similar',
      };
    }
  }

  return { strike: false };
}
