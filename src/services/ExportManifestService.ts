import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Marker from 'react-native-image-marker';
import { blendshapeDistance } from './BlendshapeService';
import { timed, logBenchmark, type BenchmarkEntry } from '../utils/benchmark';
import type { FrameEntry, ManifestConfig, ManifestFrame, ExportManifest } from '../types/export';

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri.startsWith('file://') ? uri : `file://${uri}`,
      (width, height) => resolve({ width, height }),
      reject
    );
  });
}

const COUNTDOWN_LABELS = ['3', '2', '1', 'FACE'] as const;
const STRIKE_LABELS: Record<string, string> = {
  similar: 'SAME',
  tilt: 'TILT',
  zoom: 'ZOOM',
  nfd: 'NFD',
};
const GOLD = '#e6c44d';
const RED = '#c00';
const SHADOW_STYLE = { dx: 2, dy: 2, radius: 5, color: '#000000' };

// ---------------------------------------------------------------------------
// Nearest-neighbor reordering
// ---------------------------------------------------------------------------

export function reorderByBlendshapeNN(frames: FrameEntry[]): FrameEntry[] {
  if (frames.length <= 1) return [...frames];

  const remaining = frames.map((f, i) => ({ frame: f, idx: i }));
  const result: FrameEntry[] = [];

  // Pin baseline (first frame) as starting point
  const startIdx = remaining.findIndex((r) => r.idx === 0);
  const start = remaining.splice(startIdx >= 0 ? startIdx : 0, 1)[0];
  result.push(start.frame);

  while (remaining.length > 0) {
    const last = result[result.length - 1];
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = blendshapeDistance(last.blendshapes, remaining[i].frame.blendshapes);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    result.push(remaining.splice(bestIdx, 1)[0].frame);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Build export manifest
// ---------------------------------------------------------------------------

export function buildExportManifest(
  frames: FrameEntry[],
  config: ManifestConfig
): ExportManifest {
  let ordered = config.ordering === 'nearest-neighbor'
    ? reorderByBlendshapeNN(frames)
    : [...frames];

  const manifestFrames: ManifestFrame[] = ordered.map((entry, i) => {
    let label: string | undefined;
    let labelColor: string | undefined;
    let repeat: number;

    if (i < 4) {
      label = COUNTDOWN_LABELS[i];
      labelColor = GOLD;
      repeat = config.countdownRepeat;
    } else if (entry.role === 'strike' && entry.strikeType) {
      label = STRIKE_LABELS[entry.strikeType];
      labelColor = RED;
      repeat = config.strikeRepeat;
    } else {
      repeat = config.passRepeat;
    }

    return {
      sourceUri: entry.uri,
      label,
      labelColor,
      repeat,
      durationPerRepeat: config.durationPerFrame,
    };
  });

  const totalFrameCount = manifestFrames.reduce((sum, f) => sum + f.repeat, 0);
  const totalDuration = manifestFrames.reduce((sum, f) => sum + f.repeat * f.durationPerRepeat, 0);

  return { frames: manifestFrames, totalFrameCount, totalDuration };
}

// ---------------------------------------------------------------------------
// Render overlays (only for frames with labels)
// ---------------------------------------------------------------------------

export async function renderManifestOverlays(
  manifest: ExportManifest,
  docDir: string
): Promise<{ manifest: ExportManifest; tempPaths: string[] }> {
  const bench: BenchmarkEntry[] = [];
  const t0 = performance.now();
  const ts = Date.now();
  const exportDir = `${docDir}export/`;
  await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });

  const tempPaths: string[] = [];
  const updatedFrames: ManifestFrame[] = [];

  for (let i = 0; i < manifest.frames.length; i++) {
    const frame = manifest.frames[i];
    if (!frame.label) {
      updatedFrames.push(frame);
      continue;
    }

    const stepLabel = `overlay_${i}`;
    const { result: overlayUri, ms } = await timed(stepLabel, async () => {
      const { width: imgW, height: imgH } = await getImageSize(frame.sourceUri);
      const filename = `321FACE_overlay_${ts}_${i}`;
      const markedUri = await Marker.markText({
        backgroundImage: { src: frame.sourceUri, scale: 1 },
        watermarkTexts: [{
          text: frame.label!,
          position: { X: imgW / 2, Y: imgH / 3 },
          style: {
            color: frame.labelColor ?? GOLD,
            fontSize: 360,
            bold: true,
            textAlign: 'center',
            shadowStyle: SHADOW_STYLE,
          },
        }],
        saveFormat: 'jpg',
        quality: 95,
        filename,
      });

      if (!markedUri) return null;

      const destPath = `${exportDir}overlay_${ts}_${i}.jpg`;
      const fromUri = markedUri.startsWith('file://') ? markedUri : `file://${markedUri}`;
      await FileSystem.copyAsync({ from: fromUri, to: destPath });
      return destPath;
    });
    bench.push({ label: stepLabel, ms });

    if (overlayUri) {
      const overlayFileUri = overlayUri.startsWith('file://') ? overlayUri : `file://${overlayUri}`;
      updatedFrames.push({ ...frame, overlayUri: overlayFileUri });
      tempPaths.push(overlayUri.replace(/^file:\/\//, ''));
    } else {
      updatedFrames.push(frame);
    }
  }

  const totalMs = Math.round((performance.now() - t0) * 100) / 100;
  logBenchmark('Overlays', { steps: bench, totalMs });

  return {
    manifest: { ...manifest, frames: updatedFrames },
    tempPaths,
  };
}

// ---------------------------------------------------------------------------
// Build FFmpeg concat list
// ---------------------------------------------------------------------------

function toFfmpegPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

export function buildConcatList(frames: ManifestFrame[]): string {
  const lines: string[] = [];
  for (const frame of frames) {
    const path = toFfmpegPath(frame.overlayUri ?? frame.sourceUri);
    for (let r = 0; r < frame.repeat; r++) {
      lines.push(`file '${path}'`);
      lines.push(`duration ${frame.durationPerRepeat}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Cleanup export directory
// ---------------------------------------------------------------------------

export async function cleanupExportDir(docDir: string): Promise<void> {
  const exportDir = `${docDir}export/`;
  try {
    await FileSystem.deleteAsync(exportDir, { idempotent: true });
  } catch {
    // Best-effort cleanup
  }
}
