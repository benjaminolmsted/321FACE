import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Face } from '@react-native-ml-kit/face-detection';

const STORAGE_KEY = '@321face_faces';

export interface StoredFaceData {
  roundIndex: number;
  imageUri: string;
  face?: Face;
  embedding?: number[];
  blendshapes?: number[];
  faceLandmarks?: { x: number; y: number; z: number }[];
  facePose?: { pitchDeg: number; rollDeg: number; yawDeg: number };
  /** Source image dimensions; landmarks are normalized 0-1 relative to these */
  sourceImageWidth?: number;
  sourceImageHeight?: number;
  /** Inter-ocular distance (normalized) for zoom strike check */
  interOcularDistance?: number;
  inputHash?: string;
  timestamp: number;
}

export async function loadStoredFaces(): Promise<StoredFaceData[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredFaceData[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveFace(data: StoredFaceData): Promise<void> {
  const faces = await loadStoredFaces();
  faces.push(data);
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(faces));
}

export async function clearStoredFaces(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}

export async function getFacesForRound(roundIndex: number): Promise<StoredFaceData[]> {
  const faces = await loadStoredFaces();
  return faces.filter((f) => f.roundIndex < roundIndex);
}
