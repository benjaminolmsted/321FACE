/**
 * FaceNet embedding extraction using TFLite
 */

import { loadTensorflowModel } from 'react-native-fast-tflite';
import { convertToRGB } from 'react-native-image-to-rgb';
import { alignFaceFromMLKit } from '../utils/faceAlignment';
import type { Face } from '@react-native-ml-kit/face-detection';

const MODEL = require('../../assets/facenet.tflite');

let model: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

export async function loadFaceNetModel(): Promise<void> {
  if (model) return;
  model = await loadTensorflowModel(MODEL);
}

/**
 * Normalize pixel for FaceNet: (pixel - 127.5) / 128.0
 */
function normalizePixels(rgb: number[]): Float32Array {
  const out = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    out[i] = (rgb[i] - 127.5) / 128.0;
  }
  return out;
}

export async function extractEmbedding(
  imageUri: string,
  face: Face
): Promise<number[] | null> {
  const aligned = await alignFaceFromMLKit(imageUri, face);
  if (!aligned) return null;

  const rgb = await convertToRGB(aligned.uri);
  const normalized = normalizePixels(rgb);

  if (!model) await loadFaceNetModel();
  if (!model) return null;

  const inputTensor = model.inputs[0];
  if (!inputTensor) return null;

  // FaceNet expects [1, 160, 160, 3] NHWC - normalized is 160*160*3 = 76800
  const output = await model.run([normalized]);

  if (!output || output.length === 0) return null;
  const embedding = Array.from(output[0] as Float32Array | number[]);
  return embedding;
}
