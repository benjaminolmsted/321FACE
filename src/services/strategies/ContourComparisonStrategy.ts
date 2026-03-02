import type { Face } from '@react-native-ml-kit/face-detection';
import { computeContourSimilarity } from '../../utils/contourUtils';
import { GAME_CONFIG } from '../../utils/constants';
import type { CompareContext, ComparisonResult, FaceComparisonStrategy } from './types';

const TILT_THRESHOLD = GAME_CONFIG.TILT_THRESHOLD_DEGREES;

function checkTilt(face: Face): boolean {
  const rx = Math.abs(face.rotationX ?? 0);
  const ry = Math.abs(face.rotationY ?? 0);
  const rz = Math.abs(face.rotationZ ?? 0);
  return rx > TILT_THRESHOLD || ry > TILT_THRESHOLD || rz > TILT_THRESHOLD;
}

export class ContourComparisonStrategy implements FaceComparisonStrategy {
  name = 'contour';

  async compare(context: CompareContext): Promise<ComparisonResult> {
    const t0 = performance.now();

    if (checkTilt(context.currentFace)) {
      return { strike: true, reason: 'tilt', timingMs: performance.now() - t0 };
    }

    let bestScores: { overall: number; perContour: Record<string, number> } | undefined;

    for (const prev of context.previousFaces) {
      const { overall, perContour, passed } = computeContourSimilarity(
        context.currentFace,
        prev.face
      );
      bestScores = { overall, perContour };
      if (passed) {
        return {
          strike: true,
          reason: 'similar',
          contourScores: bestScores,
          timingMs: performance.now() - t0,
        };
      }
    }

    return {
      strike: false,
      contourScores: bestScores,
      timingMs: performance.now() - t0,
    };
  }
}
