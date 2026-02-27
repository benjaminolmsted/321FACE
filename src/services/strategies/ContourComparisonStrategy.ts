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
    if (checkTilt(context.currentFace)) {
      return { strike: true, reason: 'tilt' };
    }

    for (const prev of context.previousFaces) {
      const { passed } = computeContourSimilarity(context.currentFace, prev.face);
      if (passed) {
        return { strike: true, reason: 'similar' };
      }
    }

    return { strike: false };
  }
}
