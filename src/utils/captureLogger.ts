import * as FileSystem from 'expo-file-system/legacy';

const LOG_FILE = 'face_capture_log.json';

export interface CaptureLogEntry {
  timestamp: number;
  roundIndex: number;
  rawImageUri: string;
  faceNetInputUri: string;
  inputHash: string;
  embedding: number[];
  embeddingFirst10: number[];
  scores?: unknown;
  benchmarks?: unknown;
  previousCount: number;
}

export async function logCaptureToFile(entry: CaptureLogEntry): Promise<void> {
  const dir = FileSystem.documentDirectory;
  if (!dir) return;

  const path = `${dir}${LOG_FILE}`;
  let records: CaptureLogEntry[] = [];

  try {
    const exists = await FileSystem.getInfoAsync(path);
    if (exists.exists) {
      const raw = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(raw);
      records = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    records = [];
  }

  records.push(entry);
  await FileSystem.writeAsStringAsync(path, JSON.stringify(records), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
