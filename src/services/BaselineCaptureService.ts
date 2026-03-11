/**
 * Baseline capture: split so UI can show flipped image immediately, then process.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, getInterOcularDistance } from './BlendshapeService';
import { saveFace } from './StorageService';
import { CAPTURE_MAX_WIDTH } from '../utils/constants';

export type BaselineProcessResult =
  | { ok: true; faceLandmarks: { x: number; y: number; z: number }[]; sourceImageWidth: number; sourceImageHeight: number }
  | { ok: false; debugImageUri: string };

/**
 * Flip photo and save to temp. Fast — use to show image in UI immediately.
 * Caller must delete the returned path when done.
 */
export async function flipBaselineForDisplay(photoUri: string): Promise<{ flippedPath: string }> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  const flipped = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ flip: ImageManipulator.FlipType.Horizontal }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  const path = `${docDir}face_baseline_temp_${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: flipped.uri, to: path });
  return { flippedPath: path };
}

/**
 * Process flipped temp image: resize → perm, extract blendshapes, saveFace.
 * Run after UI has shown the flipped image.
 */
export async function processBaselineFromTemp(
  tempPath: string,
  photoWidth: number
): Promise<BaselineProcessResult> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  const permPath = `${docDir}face_baseline_${Date.now()}.jpg`;

  if (photoWidth > CAPTURE_MAX_WIDTH) {
    const resized = await ImageManipulator.manipulateAsync(
      tempPath,
      [{ resize: { width: CAPTURE_MAX_WIDTH } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    await FileSystem.copyAsync({ from: resized.uri, to: permPath });
  } else {
    await FileSystem.copyAsync({ from: tempPath, to: permPath });
  }

  const result = await extractBlendshapes(tempPath);
  if (!result) {
    return { ok: false, debugImageUri: permPath };
  }

  const interOcularDistance = getInterOcularDistance(result.faceLandmarks);
  await saveFace({
    roundIndex: 0,
    imageUri: permPath,
    blendshapes: result.scores,
    faceLandmarks: result.faceLandmarks,
    facePose: result.facePose,
    sourceImageWidth: result.sourceImageWidth,
    sourceImageHeight: result.sourceImageHeight,
    interOcularDistance: interOcularDistance || undefined,
    timestamp: Date.now(),
  });

  return {
    ok: true,
    faceLandmarks: result.faceLandmarks,
    sourceImageWidth: result.sourceImageWidth,
    sourceImageHeight: result.sourceImageHeight,
  };
}
