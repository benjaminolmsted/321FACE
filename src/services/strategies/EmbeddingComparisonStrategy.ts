import { FACE_NET_SIMILARITY_THRESHOLD } from '../../utils/constants';
import { extractEmbedding } from '../FaceNetService';
import type { CompareContext, ComparisonResult, FaceComparisonStrategy } from './types';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingComparisonStrategy implements FaceComparisonStrategy {
  name = 'embedding';

  async compare(context: CompareContext): Promise<ComparisonResult> {
    let currentEmb: number[] | undefined = context.currentEmbedding;
    if (!currentEmb) {
      const extracted = await extractEmbedding(context.currentImageUri, context.currentFace);
      if (!extracted) return { strike: false };
      currentEmb = extracted;
    }

    for (const prev of context.previousFaces) {
      let prevEmb = prev.embedding;
      if (!prevEmb) {
        const extracted = await extractEmbedding(prev.imageUri, prev.face);
        if (!extracted) continue;
        prevEmb = extracted;
      }
      const sim = cosineSimilarity(currentEmb, prevEmb);
      if (sim >= FACE_NET_SIMILARITY_THRESHOLD) {
        return { strike: true, reason: 'similar' };
      }
    }

    return { strike: false };
  }
}
