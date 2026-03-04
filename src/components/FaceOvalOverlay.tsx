/**
 * Draws the baseline face oval/landmarks as an overlay for alignment.
 * Uses MediaPipe face oval connections.
 *
 * Coordinate system: MediaPipe returns landmarks normalized [0,1] where
 * x = horizontal position relative to image WIDTH (0=left, 1=right)
 * y = vertical position relative to image HEIGHT (0=top, 1=bottom)
 * So: pixelX = x * sourceImageWidth, pixelY = y * sourceImageHeight
 *
 * When sourceImageWidth/Height are provided, we scale from source rect to overlay
 * rect preserving aspect ratio (fit). Otherwise we use overlay dimensions directly.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { faceLandmarkDetectionModuleConstants } from 'react-native-mediapipe';

export interface FaceLandmark {
  x: number;
  y: number;
  z: number;
}

interface FaceOvalOverlayProps {
  /** Baseline face landmarks (normalized 0-1 relative to source image). */
  landmarks: FaceLandmark[];
  /** Overlay dimensions (camera preview size). */
  width: number;
  height: number;
  /** Source image dimensions; landmarks are relative to these. Required for correct scaling. */
  sourceImageWidth?: number;
  sourceImageHeight?: number;
  /** Mirror horizontally (for front camera preview). */
  mirror?: boolean;
  /** Stroke color. */
  stroke?: string;
  /** Stroke width. */
  strokeWidth?: number;
  /** Opacity 0-1. */
  opacity?: number;
}

// Cache face oval connections (same for all faces)
let _faceOvalConnections: { start: number; end: number }[] | null = null;

function getFaceOvalConnections(): { start: number; end: number }[] {
  if (_faceOvalConnections) return _faceOvalConnections;
  try {
    const constants = faceLandmarkDetectionModuleConstants();
    _faceOvalConnections = constants.knownLandmarks.faceOval ?? [];
  } catch {
    _faceOvalConnections = [];
  }
  return _faceOvalConnections;
}

/** Build SVG path from landmarks + connections.
 * Maps normalized [0,1] source coords to overlay using aspect-ratio-preserving fit. */
function buildOvalPath(
  landmarks: FaceLandmark[],
  connections: { start: number; end: number }[],
  overlayW: number,
  overlayH: number,
  srcW: number | undefined,
  srcH: number | undefined,
  mirror: boolean
): string {
  if (landmarks.length === 0 || connections.length === 0) return '';

  let toX: (x: number) => number;
  let toY: (y: number) => number;

  if (srcW != null && srcH != null && srcW > 0 && srcH > 0) {
    // Fit source rect into overlay, preserve aspect ratio
    const scale = Math.min(overlayW / srcW, overlayH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const offsetX = (overlayW - drawW) / 2;
    const offsetY = (overlayH - drawH) / 2;
    toX = (x: number) => {
      const nx = mirror ? 1 - x : x;
      return nx * srcW * scale + offsetX;
    };
    toY = (y: number) => y * srcH * scale + offsetY;
  } else {
    // Fallback: direct mapping (assumes overlay matches source aspect)
    toX = (x: number) => (mirror ? (1 - x) * overlayW : x * overlayW);
    toY = (y: number) => y * overlayH;
  }

  const segments: string[] = [];
  for (const { start, end } of connections) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) continue;
    segments.push(`M ${toX(a.x)} ${toY(a.y)} L ${toX(b.x)} ${toY(b.y)}`);
  }
  return segments.join(' ');
}

export function FaceOvalOverlay({
  landmarks,
  width,
  height,
  sourceImageWidth,
  sourceImageHeight,
  mirror = false,
  stroke = 'rgba(0, 255, 136, 0.8)',
  strokeWidth = 2,
  opacity = 0.9,
}: FaceOvalOverlayProps) {
  const [path, setPath] = useState('');

  useEffect(() => {
    const connections = getFaceOvalConnections();
    const d = buildOvalPath(
      landmarks,
      connections,
      width,
      height,
      sourceImageWidth,
      sourceImageHeight,
      mirror
    );
    setPath(d);
  }, [landmarks, width, height, sourceImageWidth, sourceImageHeight, mirror]);

  if (!path || width < 1 || height < 1) return null;

  return (
    <View style={[styles.overlay, { width, height }]} pointerEvents="none">
      <Svg width={width} height={height} style={{ opacity }}>
        <Path
          d={path}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
