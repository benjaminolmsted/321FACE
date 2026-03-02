import { FACE_NET_SIMILARITY_THRESHOLD } from '../../utils/constants';
import { extractEmbedding, extractEmbeddingWithTiming } from '../FaceNetService';
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
    const t0 = performance.now();
    let faceNetTiming: ComparisonResult['faceNetTimingMs'];

    let currentEmb: number[] | undefined = context.currentEmbedding;
    if (!currentEmb) {
      const result = await extractEmbeddingWithTiming(context.currentImageUri, context.currentFace);
      if (!result) return { strike: false, timingMs: performance.now() - t0 };
      currentEmb = result.embedding;
      faceNetTiming = result.timingMs;
    }

    const perFace: number[] = [];

    for (const prev of context.previousFaces) {
      let prevEmb = prev.embedding;
      if (!prevEmb) {
        const extracted = await extractEmbedding(prev.imageUri, prev.face);
        if (!extracted) continue;
        prevEmb = extracted;
      }
      const sim = cosineSimilarity(currentEmb, prevEmb);
      perFace.push(sim);
      if (sim >= FACE_NET_SIMILARITY_THRESHOLD) {
        return {
          strike: true,
          reason: 'similar',
          embeddingScores: {
            maxSimilarity: Math.max(...perFace),
            perFace,
          },
          timingMs: performance.now() - t0,
          faceNetTimingMs: faceNetTiming,
        };
      }
    }

    const maxSimilarity = perFace.length > 0 ? Math.max(...perFace) : 0;
    return {
      strike: false,
      embeddingScores: perFace.length > 0 ? { maxSimilarity, perFace } : undefined,
      timingMs: performance.now() - t0,
      faceNetTimingMs: faceNetTiming,
    };
  }
}
