/**
 * Baseline capture: split so UI can show flipped image immediately, then process.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, getInterOcularDistance } from './BlendshapeService';
import { saveFace } from './StorageService';
import { CAPTURE_MAX_WIDTH } from '../utils/constants';
import { timed, logBenchmark, type BenchmarkEntry } from '../utils/benchmark';

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

  const { result: flipped, ms: flipMs } = await timed('baselineFlip', () =>
    ImageManipulator.manipulateAsync(
      photoUri,
      [{ flip: ImageManipulator.FlipType.Horizontal }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    )
  );
  const path = `${docDir}face_baseline_temp_${Date.now()}.jpg`;
  const { ms: copyMs } = await timed('baselineCopy', () =>
    FileSystem.copyAsync({ from: flipped.uri, to: path })
  );
  logBenchmark('BaselineFlip', { steps: [{ label: 'flip', ms: flipMs }, { label: 'copy', ms: copyMs }], totalMs: flipMs + copyMs });
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
  const bench: BenchmarkEntry[] = [];
  const t0 = performance.now();

  const permPath = `${docDir}face_baseline_${Date.now()}.jpg`;

  const { ms: saveMs } = await timed('baselineSave', async () => {
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
  });
  bench.push({ label: 'save', ms: saveMs });

  const { result, ms: extractMs } = await timed('baselineExtract', () => extractBlendshapes(tempPath));
  bench.push({ label: 'extract', ms: extractMs });

  if (!result) {
    const totalMs = Math.round((performance.now() - t0) * 100) / 100;
    logBenchmark('BaselineProcess', { steps: bench, totalMs });
    return { ok: false, debugImageUri: permPath };
  }

  const interOcularDistance = getInterOcularDistance(result.faceLandmarks);
  const { ms: storageMs } = await timed('baselineStore', () =>
    saveFace({
      roundIndex: 0,
      imageUri: permPath,
      blendshapes: result.scores,
      faceLandmarks: result.faceLandmarks,
      facePose: result.facePose,
      sourceImageWidth: result.sourceImageWidth,
      sourceImageHeight: result.sourceImageHeight,
      interOcularDistance: interOcularDistance || undefined,
      timestamp: Date.now(),
    })
  );
  bench.push({ label: 'store', ms: storageMs });

  const totalMs = Math.round((performance.now() - t0) * 100) / 100;
  logBenchmark('BaselineProcess', { steps: bench, totalMs });

  return {
    ok: true,
    faceLandmarks: result.faceLandmarks,
    sourceImageWidth: result.sourceImageWidth,
    sourceImageHeight: result.sourceImageHeight,
  };
}
