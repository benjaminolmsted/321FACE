/**
 * Draws the baseline face oval/landmarks as an overlay for alignment.
 * Uses MediaPipe face oval connections.
 *
 * Coordinate system: MediaPipe returns landmarks normalized [0,1] where
 * x = horizontal position relative to image WIDTH (0=left, 1=right)
 * y = vertical position relative to image HEIGHT (0=top, 1=bottom)
 *
 * previewScaleMode must match CameraView:
 * - fit: preview uses contain (letterboxing). Android typically.
 * - fill: preview uses cover (cropping). iOS typically.
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
  /** How camera preview scales: 'fit' (contain) or 'fill' (cover). Must match CameraView. */
  previewScaleMode?: 'fit' | 'fill';
  /** Scale multiplier for oval size (default 1). Use >1 to enlarge if oval appears too small. */
  scaleX?: number;
  /** Scale multiplier for oval size (default 1). Use >1 to enlarge if oval appears too small. */
  scaleY?: number;
  /** Mirror horizontally (for front camera preview). */
  mirror?: boolean;
  /** Horizontal offset in overlay pixels (positive = shift right). Use to correct x-axis misalignment. */
  offsetX?: number;
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
 * Maps normalized [0,1] source coords to overlay. previewScaleMode: fit=contain, fill=cover. */
function buildOvalPath(
  landmarks: FaceLandmark[],
  connections: { start: number; end: number }[],
  overlayW: number,
  overlayH: number,
  srcW: number | undefined,
  srcH: number | undefined,
  previewScaleMode: 'fit' | 'fill',
  scaleX: number,
  scaleY: number,
  mirror: boolean,
  shiftX: number
): string {
  if (landmarks.length === 0 || connections.length === 0) return '';

  let toX: (x: number) => number;
  let toY: (y: number) => number;

  if (srcW != null && srcH != null && srcW > 0 && srcH > 0) {
    const useFill = previewScaleMode === 'fill';
    const scale = useFill
      ? Math.max(overlayW / srcW, overlayH / srcH)
      : Math.min(overlayW / srcW, overlayH / srcH);
    const drawW = srcW * scale * scaleX;
    const drawH = srcH * scale * scaleY;
    const offsetX = (overlayW - drawW) / 2;
    const offsetY = (overlayH - drawH) / 2;
    toX = (x: number) => {
      const nx = mirror ? 1 - x : x;
      return nx * srcW * scale * scaleX + offsetX + shiftX;
    };
    toY = (y: number) => y * srcH * scale * scaleY + offsetY;
  } else {
    toX = (x: number) => (mirror ? (1 - x) * overlayW : x * overlayW) + shiftX;
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
  previewScaleMode = 'fill',
  scaleX = 1,
  scaleY = 1,
  mirror = false,
  offsetX = 0,
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
      previewScaleMode,
      scaleX,
      scaleY,
      mirror,
      offsetX
    );
    setPath(d);
  }, [landmarks, width, height, sourceImageWidth, sourceImageHeight, previewScaleMode, scaleX, scaleY, mirror, offsetX]);

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
