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
  reason?: 'similar' | 'tilt';
}

export interface FaceComparisonStrategy {
  name: string;
  compare(context: CompareContext): Promise<ComparisonResult>;
}
