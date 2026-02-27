/**
 * Face alignment for FaceNet: crop, rotate (level eyes), resize to 160x160
 */

import type { Face } from '@react-native-ml-kit/face-detection';
import * as ImageManipulator from 'expo-image-manipulator';

const FACE_NET_SIZE = 160;

export interface AlignResult {
  uri: string;
  width: number;
  height: number;
}

/**
 * Align face from ML Kit detection for FaceNet input.
 * Uses bounds and landmarks to crop, rotate (level eyes), and resize to 160x160.
 */
export async function alignFaceFromMLKit(
  imageUri: string,
  face: Face
): Promise<AlignResult | null> {
  try {
    const { frame, landmarks } = face;

    // Expand crop slightly for context
    const pad = 0.15;
    const w = frame.width;
    const h = frame.height;
    const padW = w * pad;
    const padH = h * pad;

    let originX = Math.max(0, frame.left - padW);
    let originY = Math.max(0, frame.top - padH);
    let cropW = Math.min(w + 2 * padW, 9999);
    let cropH = Math.min(h + 2 * padH, 9999);

    // Rotation: level the eyes
    let rotate = 0;
    if (landmarks?.leftEye && landmarks?.rightEye) {
      const leftEye = landmarks.leftEye.position;
      const rightEye = landmarks.rightEye.position;
      const dy = rightEye.y - leftEye.y;
      const dx = rightEye.x - leftEye.x;
      rotate = (Math.atan2(dy, dx) * 180) / Math.PI;
    }

    const actions: ImageManipulator.Action[] = [
      {
        crop: {
          originX,
          originY,
          width: cropW,
          height: cropH,
        },
      },
    ];

    if (Math.abs(rotate) > 1) {
      actions.push({ rotate });
    }

    actions.push({
      resize: { width: FACE_NET_SIZE, height: FACE_NET_SIZE },
    });

    const result = await ImageManipulator.manipulateAsync(imageUri, actions, {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      width: FACE_NET_SIZE,
      height: FACE_NET_SIZE,
    };
  } catch {
    return null;
  }
}
