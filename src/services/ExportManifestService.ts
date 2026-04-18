import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Marker from 'react-native-image-marker';
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
const OVERLAY_FONT_SIZE = 360;

// Approximate character widths as a fraction of fontSize for bold system font.
// Measured from Roboto Bold / SF Pro Bold at large sizes.
const CHAR_WIDTH: Record<string, number> = {
  '1': 0.40, '2': 0.55, '3': 0.55,
  'A': 0.65, 'C': 0.62, 'D': 0.68, 'E': 0.55, 'F': 0.53,
  'I': 0.30, 'L': 0.52, 'M': 0.80, 'N': 0.68, 'O': 0.70,
  'S': 0.58, 'T': 0.58, 'Z': 0.58,
};
const DEFAULT_CHAR_WIDTH = 0.60;

function estimateTextWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) {
    width += (CHAR_WIDTH[ch] ?? DEFAULT_CHAR_WIDTH) * fontSize;
  }
  return width;
}

// ---------------------------------------------------------------------------
// Build export manifest
// ---------------------------------------------------------------------------

export function buildExportManifest(
  frames: FrameEntry[],
  config: ManifestConfig
): ExportManifest {
  const ordered = [...frames];

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
      const textWidth = estimateTextWidth(frame.label!, OVERLAY_FONT_SIZE);
      const centeredX = Math.max(0, (imgW - textWidth) / 2);

      const markedUri = await Marker.markText({
        backgroundImage: { src: frame.sourceUri, scale: 1 },
        watermarkTexts: [{
          text: frame.label!,
          position: { X: centeredX, Y: imgH / 3 },
          style: {
            color: frame.labelColor ?? GOLD,
            fontSize: OVERLAY_FONT_SIZE,
            bold: true,
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
