/**
 * FaceNet embedding extraction using TFLite
 */

import { loadTensorflowModel } from 'react-native-fast-tflite';
import { convertToRGB } from 'react-native-image-to-rgb';
import { alignFaceFromMLKit } from '../utils/faceAlignment';
import { hashNumbers } from '../utils/hashUtils';
import type { Face } from '@react-native-ml-kit/face-detection';

const MODEL = require('../../assets/facenet.tflite');

let model: Awaited<ReturnType<typeof loadTensorflowModel>> | null = null;

export async function loadFaceNetModel(): Promise<void> {
  if (model) return;
  model = await loadTensorflowModel(MODEL);
}

export interface ExtractEmbeddingResult {
  embedding: number[];
  alignedImageUri: string;
  inputHash: string;
  inputType: 'uint8' | 'float32';
  timingMs: {
    align: number;
    convertRgb: number;
    modelRun: number;
    total: number;
  };
}

export async function extractEmbedding(
  imageUri: string,
  face: Face
): Promise<number[] | null> {
  const result = await extractEmbeddingWithTiming(imageUri, face);
  return result?.embedding ?? null;
}

export async function extractEmbeddingWithTiming(
  imageUri: string,
  face: Face
): Promise<ExtractEmbeddingResult | null> {
  const t0 = performance.now();

  const tAlign0 = performance.now();
  const aligned = await alignFaceFromMLKit(imageUri, face);
  const alignMs = performance.now() - tAlign0;

  if (!aligned) return null;

  const tRgb0 = performance.now();
  const rgb = await convertToRGB(aligned.uri);
  const convertRgbMs = performance.now() - tRgb0;

  if (!model) await loadFaceNetModel();
  if (!model) return null;

  const inputTensor = model.inputs[0];
  if (!inputTensor) return null;

  const inputHash = hashNumbers(rgb);

  // Detect whether model expects uint8 or float32 input.
  // Quantized models expect raw [0,255] pixels; float models expect normalized [-1,1].
  const isQuantized = inputTensor.dataType === 'uint8' || inputTensor.dataType === 'int8';
  let inputData: Uint8Array | Float32Array;
  let inputType: 'uint8' | 'float32';

  if (isQuantized) {
    inputData = new Uint8Array(rgb);
    inputType = 'uint8';
  } else {
    const buf = new Float32Array(rgb.length);
    for (let i = 0; i < rgb.length; i++) {
      buf[i] = (rgb[i] - 127.5) / 128.0;
    }
    inputData = buf;
    inputType = 'float32';
  }

  const tModel0 = performance.now();
  const output = await model.run([inputData]);
  const modelRunMs = performance.now() - tModel0;

  if (!output || output.length === 0) return null;
  const rawOutput = output[0];
  const arr = Array.from(rawOutput as Iterable<number>);

  // Quantized models output uint8; dequantize to float.
  const QUANT_SCALE = 0.0235294122248888;
  const QUANT_ZERO = 0;

  const looksLikeUint8 =
    arr.length >= 128 &&
    arr.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255);

  const embedding: number[] = looksLikeUint8
    ? arr.map((v) => (v - QUANT_ZERO) * QUANT_SCALE)
    : arr;

  const totalMs = performance.now() - t0;

  return {
    embedding,
    alignedImageUri: aligned.uri,
    inputHash,
    inputType,
    timingMs: { align: alignMs, convertRgb: convertRgbMs, modelRun: modelRunMs, total: totalMs },
  };
}
