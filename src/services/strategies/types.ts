import type { Face } from '@react-native-ml-kit/face-detection';

export interface CompareContext {
  currentFace: Face;
  currentImageUri: string;
  currentEmbedding?: number[];
  previousFaces: Array<{
    face: Face;
    imageUri: string;
    embedding?: number[];
  }>;
}

export interface ComparisonResult {
  strike: boolean;
  reason?: 'similar' | 'tilt' | 'zoom';
  /** Contour: overall + per-contour scores (best match) */
  contourScores?: { overall: number; perContour: Record<string, number> };
  /** Embedding: max cosine similarity vs previous faces */
  embeddingScores?: { maxSimilarity: number; perFace: number[] };
  timingMs?: number;
  /** FaceNet extraction timing when strategy performs it */
  faceNetTimingMs?: { align: number; convertRgb: number; modelRun: number; total: number };
}

export interface FaceComparisonStrategy {
  name: string;
  compare(context: CompareContext): Promise<ComparisonResult>;
}
