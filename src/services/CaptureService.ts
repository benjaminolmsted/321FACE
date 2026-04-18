/**
 * Atomized capture pipeline. Each function is a discrete, benchmarkable step.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, blendshapeDistance, getInterOcularDistance, type BlendshapeResult } from './BlendshapeService';
import type { StoredFaceData } from './StorageService';
import type { StrikeReason, ProcessResult } from './FaceComparisonService';
import { GAME_CONFIG, CAPTURE_MAX_WIDTH, INTER_OCULAR_ZOOM_THRESHOLD } from '../utils/constants';

// ---------------------------------------------------------------------------
// Step 1: Capture
// ---------------------------------------------------------------------------

export type CaptureResult = { uri: string; width: number; height: number };

export async function capturePhoto(
  cameraRef: React.RefObject<any>
): Promise<CaptureResult | null> {
  const photo = await cameraRef.current.takePictureAsync({
    quality: 1,
    base64: false,
    shutterSound: false,
  });
  if (!photo?.uri) return null;
  return { uri: photo.uri, width: photo.width, height: photo.height };
}

// ---------------------------------------------------------------------------
// Step 2: Flip
// ---------------------------------------------------------------------------

export type FlipResult = { tempLargePath: string };

export async function flipAndSaveTemp(
  photoUri: string,
  docDir: string,
  ts: number
): Promise<FlipResult> {
  const tempLargePath = `${docDir}face_temp_large_${ts}.jpg`;
  const flipped = await ImageManipulator.manipulateAsync(
    photoUri,
    [{ flip: ImageManipulator.FlipType.Horizontal }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  await FileSystem.copyAsync({ from: flipped.uri, to: tempLargePath });
  return { tempLargePath };
}

// ---------------------------------------------------------------------------
// Step 3: Save permanent (resized) copy
// ---------------------------------------------------------------------------

export type SaveResult = { permPath: string };

export async function savePermImage(
  tempLargePath: string,
  photoWidth: number,
  docDir: string,
  ts: number
): Promise<SaveResult> {
  const permPath = `${docDir}face_${ts}.jpg`;
  if (photoWidth > CAPTURE_MAX_WIDTH) {
    const resized = await ImageManipulator.manipulateAsync(
      tempLargePath,
      [{ resize: { width: CAPTURE_MAX_WIDTH } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );
    await FileSystem.copyAsync({ from: resized.uri, to: permPath });
  } else {
    await FileSystem.copyAsync({ from: tempLargePath, to: permPath });
  }
  return { permPath };
}

// ---------------------------------------------------------------------------
// Step 4: Extract features (blendshapes + inter-ocular distance)
// ---------------------------------------------------------------------------

export type FeatureResult = {
  blendshapes: BlendshapeResult;
  interOcularDistance: number;
};

export async function extractFeatures(
  imagePath: string
): Promise<FeatureResult | null> {
  const result = await extractBlendshapes(imagePath);
  if (!result) return null;
  const iod = getInterOcularDistance(result.faceLandmarks);
  return { blendshapes: result, interOcularDistance: iod };
}

// ---------------------------------------------------------------------------
// Step 5: Compare and decide (pure computation, no IO)
// ---------------------------------------------------------------------------

export type CompareConfig = {
  blendshapeThreshold: number;
  isPlayMode: boolean;
};

export type GameDecision = {
  strike: boolean;
  reason?: StrikeReason;
  scores: ProcessResult['scores'];
  benchmarks: ProcessResult['benchmarks'];
  perFaceDistances: number[];
  minDist: number | null;
};

export function compareAndDecide(
  features: FeatureResult,
  previousFaces: StoredFaceData[],
  config: CompareConfig
): GameDecision {
  const { blendshapes, interOcularDistance: currentIod } = features;
  const { blendshapeThreshold, isPlayMode } = config;
  const tiltThreshold = GAME_CONFIG.TILT_THRESHOLD_DEGREES;

  const perFaceDistances: number[] = [];
  for (const prev of previousFaces) {
    if (prev.blendshapes?.length) {
      perFaceDistances.push(blendshapeDistance(blendshapes.scores, prev.blendshapes));
    }
  }
  const minDist = perFaceDistances.length > 0 ? Math.min(...perFaceDistances) : null;

  const pose = blendshapes.facePose;
  const tiltStrike = pose && (
    Math.abs(pose.pitchDeg) > tiltThreshold ||
    Math.abs(pose.rollDeg) > tiltThreshold ||
    Math.abs(pose.yawDeg) > tiltThreshold
  );
  const blendshapeStrike = minDist != null && minDist < blendshapeThreshold;

  const baseline = previousFaces[0];
  const baselineIod = baseline?.interOcularDistance ?? 0;
  const zoomStrike = !!(
    isPlayMode &&
    baselineIod > 0 &&
    currentIod > 0 &&
    Math.abs(currentIod - baselineIod) / baselineIod > INTER_OCULAR_ZOOM_THRESHOLD
  );

  const strike = isPlayMode ? (blendshapeStrike || !!tiltStrike || zoomStrike) : false;

  const benchmarks: ProcessResult['benchmarks'] = {
    blendshapeMs: blendshapes.timingMs,
  };

  const scores: ProcessResult['scores'] = {};
  if (minDist != null) scores.blendshape = { minDistance: minDist, perFace: perFaceDistances };
  if (pose) scores.pose = { pitchDeg: pose.pitchDeg, rollDeg: pose.rollDeg, yawDeg: pose.yawDeg, tiltStrike: !!tiltStrike };
  if (baselineIod > 0 && currentIod > 0) {
    scores.interOcular = { baseline: baselineIod, current: currentIod, zoomStrike: !!zoomStrike };
  }

  return {
    strike,
    reason: strike ? (tiltStrike ? 'tilt' : zoomStrike ? 'zoom' : 'similar') : undefined,
    scores: Object.keys(scores).length > 0 ? scores : undefined,
    benchmarks,
    perFaceDistances,
    minDist,
  };
}
