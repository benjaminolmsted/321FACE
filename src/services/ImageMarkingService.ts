import * as FileSystem from 'expo-file-system/legacy';
import Marker, { Position } from 'react-native-image-marker';

export type StrikeDetailForMarking = {
  type: 'similar' | 'tilt' | 'zoom' | 'nfd';
  currentImageUri: string;
};

const COUNTDOWN_LABELS = ['3', '2', '1', 'FACE'] as const;
const STRIKE_LABELS: Record<StrikeDetailForMarking['type'], string> = {
  similar: 'SAME',
  tilt: 'TILT',
  zoom: 'ZOOM',
  nfd: 'NFD',
};

const GOLD = '#e6c44d';
const RED = '#c00';

const SHADOW_STYLE = {
  dx: 2,
  dy: 2,
  radius: 5,
  color: '#000000',
};

/**
 * Overlay pass: mark each image with its label (countdown or strike).
 * Countdown (3, 2, 1, FACE) takes precedence over strikes for the first 4 images.
 * Marked images are copied to NEW files in documentDirectory (Android rejects overwriting in place).
 * Returns uris in same order; tempPaths contains new marked file paths for cleanup after export.
 */
export async function markFaceUrisWithLabels(
  allFaceUris: string[],
  strikes: StrikeDetailForMarking[]
): Promise<{ uris: string[]; tempPaths: string[] }> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  const strikeUris = new Set(strikes.map((s) => s.currentImageUri));
  const tempPaths: string[] = [];
  const uris: string[] = [];
  const ts = Date.now();

  for (let i = 0; i < allFaceUris.length; i++) {
    const uri = allFaceUris[i];
    let label: string | null = null;
    let color = GOLD;

    if (i < 4) {
      label = COUNTDOWN_LABELS[i];
      color = GOLD;
    } else if (strikeUris.has(uri)) {
      const strike = strikes.find((s) => s.currentImageUri === uri);
      if (strike) {
        label = STRIKE_LABELS[strike.type];
        color = RED;
      }
    }

    if (!label) {
      // Unmarked: use original path (already in documentDirectory)
      uris.push(uri);
      continue;
    }

    try {
      const filename = `321FACE_marked_${Date.now()}_${i}`;
      const markedUri = await Marker.markText({
        backgroundImage: {
          src: uri,
          scale: 1,
        },
        watermarkTexts: [
          {
            text: label,
            position: { position: Position.center },
            style: {
              color,
              fontSize: 120,
              bold: true,
              textAlign: 'center',
              shadowStyle: SHADOW_STYLE,
            },
          },
        ],
        saveFormat: 'jpg',
        quality: 95,
        filename,
      });

      if (markedUri) {
        const destPath = `${docDir}321FACE_export_${ts}_${i}.jpg`;
        const fromUri = markedUri.startsWith('file://') ? markedUri : `file://${markedUri}`;
        await FileSystem.copyAsync({ from: fromUri, to: destPath });
        uris.push(destPath.startsWith('file://') ? destPath : `file://${destPath}`);
        tempPaths.push(destPath.replace(/^file:\/\//, ''));
      } else {
        uris.push(uri);
      }
    } catch (err) {
      console.warn('[ImageMarking] Failed to mark image', i, err);
      uris.push(uri);
    }
  }

  return { uris, tempPaths };
}

export async function cleanupTempMarkedPaths(paths: string[]): Promise<void> {
  for (const p of paths) {
    try {
      await FileSystem.deleteAsync(p, { idempotent: true });
    } catch {
      // Cache files may not be deletable on some Android configs; OS will purge when needed
    }
  }
}
