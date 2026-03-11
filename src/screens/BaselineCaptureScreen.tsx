import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import {
  flipBaselineForDisplay,
  processBaselineFromTemp,
} from '../services/BaselineCaptureService';
import { clearStoredFaces } from '../services/StorageService';
import { useCamera } from '../context/CameraContext';
import type { FlowPhase } from '../context/FlowContext';

const BASELINE_FLASH_DELAY_MS = 500; // Delay after oval appears before advancing

type Props = {
  flowPhase: Extract<FlowPhase, { screen: 'baseline' }>;
  advance: (next: FlowPhase) => void;
};

export function BaselineCaptureScreen({ flowPhase, advance }: Props) {
  const { phase, gameParams } = flowPhase;
  const goBack = useCallback(() => advance({ screen: 'home' }), [advance]);
  const { cameraRef, cameraReady, permission, requestPermission } = useCamera();
  const [capturing, setCapturing] = useState(false);
  const [flashResult, setFlashResult] = useState<{
    faceLandmarks: { x: number; y: number; z: number }[];
    sourceImageWidth: number;
    sourceImageHeight: number;
  } | null>(null);
  const [flashOverlaySize, setFlashOverlaySize] = useState({ width: 0, height: 0 });

  const error = phase === 'error' && flowPhase.data?.kind === 'error' ? flowPhase.data : null;
  const displayUri = phase === 'flash' && flowPhase.data?.kind === 'flash' ? flowPhase.data.displayUri : null;

  useEffect(() => {
    clearStoredFaces();
  }, []);

  useEffect(() => {
    if (phase === 'error') setCapturing(false);
  }, [phase]);

  // Reset flash result when leaving flash phase
  useEffect(() => {
    if (phase !== 'flash') setFlashResult(null);
  }, [phase]);

  // Phase handler: baseline.flash → await processing, show oval, then 500ms later advance
  useEffect(() => {
    if (phase !== 'flash' || flowPhase.data?.kind !== 'flash') return;
    const { displayUri: path, processing } = flowPhase.data;

    let cancelled = false;
    (async () => {
      const result = await processing;
      if (cancelled) return;
      if (!result.ok) {
        await FileSystem.deleteAsync(path, { idempotent: true });
        advance({
          screen: 'baseline',
          phase: 'error',
          data: { kind: 'error', message: 'No face detected. Try again.', debugImageUri: result.debugImageUri },
          gameParams,
        });
        return;
      }
      setFlashResult({
        faceLandmarks: result.faceLandmarks,
        sourceImageWidth: result.sourceImageWidth,
        sourceImageHeight: result.sourceImageHeight,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, flowPhase.data, gameParams, advance]);

  // 500ms after oval is visible, advance to game
  useEffect(() => {
    if (phase !== 'flash' || flowPhase.data?.kind !== 'flash' || !flashResult || flashOverlaySize.width === 0) return;

    const id = setTimeout(() => {
      const path = flowPhase.data.kind === 'flash' ? flowPhase.data.displayUri : null;
      if (!path) return;
      advance({
        screen: 'gameLoading',
        data: {
          imageUri: path,
          gameParams,
          faceLandmarks: flashResult.faceLandmarks,
          sourceImageWidth: flashResult.sourceImageWidth,
          sourceImageHeight: flashResult.sourceImageHeight,
        },
      });
    }, BASELINE_FLASH_DELAY_MS);

    return () => clearTimeout(id);
  }, [phase, flowPhase.data, flashResult, flashOverlaySize, gameParams, advance]);

  const doCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setCapturing(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false, shutterSound: false });
      if (!photo?.uri) return;

      console.log('[321FACE] Baseline capture:', photo.width, 'x', photo.height);

      const { flippedPath } = await flipBaselineForDisplay(photo.uri);
      const processing = processBaselineFromTemp(flippedPath, photo.width);

      advance({
        screen: 'baseline',
        phase: 'flash',
        data: { kind: 'flash', displayUri: flippedPath, processing },
        gameParams,
      });
    } catch (err) {
      console.error('[BaselineCapture] error:', err);
      setCapturing(false);
      advance({
        screen: 'baseline',
        phase: 'error',
        data: { kind: 'error', message: 'Capture failed. Try again.' },
        gameParams,
      });
    }
  }, [gameParams, advance]);

  const onRetry = useCallback(() => {
    advance({
      screen: 'baseline',
      phase: 'capture',
      gameParams,
    });
  }, [gameParams, advance]);

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera permission is required</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={goBack}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {displayUri && (
        <View
          style={styles.baselineFlashOverlay}
          pointerEvents="none"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setFlashOverlaySize({ width, height });
          }}
        >
          <Image
            source={{ uri: displayUri }}
            style={styles.baselineFlashImage}
            resizeMode="cover"
          />
          {!flashResult && <ActivityIndicator size="large" color="#fff" style={styles.flashSpinner} />}
          {flashResult && flashOverlaySize.width > 0 && (
            <FaceOvalOverlay
              landmarks={flashResult.faceLandmarks}
              width={flashOverlaySize.width}
              height={flashOverlaySize.height}
              sourceImageWidth={flashResult.sourceImageWidth}
              sourceImageHeight={flashResult.sourceImageHeight}
              previewScaleMode="fill"
              mirror={false}
              stroke="#e6c44d"
              strokeWidth={3}
            />
          )}
        </View>
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        {cameraReady && (
        <View style={styles.messageBox}>
          <Text style={styles.message}>
            Capture the baseline pose you want to use for this run
          </Text>
          <View style={styles.strikeLegend}>
            <Text style={styles.strikeLegendLine}>
              SAME <Text style={styles.strikeX}>X</Text> - face too similar to a previous face
            </Text>
            <Text style={styles.strikeLegendLine}>
              TILT <Text style={styles.strikeX}>X</Text> - tilting face too much from baseline
            </Text>
            <Text style={styles.strikeLegendLine}>
              ZOOM <Text style={styles.strikeX}>X</Text> - zooming face in or out too much
            </Text>
          </View>
        </View>
        )}

        {error && (
          <ScrollView style={styles.debugScroll} contentContainerStyle={styles.debugContainer}>
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error.message}</Text>
            </View>
            {error.debugImageUri && (
              <View style={styles.debugImageBox}>
                <Text style={styles.debugImageLabel}>Image passed to MediaPipe:</Text>
                <Image
                  source={{ uri: error.debugImageUri }}
                  style={styles.debugImage}
                  resizeMode="contain"
                />
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.bottomBar}>
          {!capturing && !displayUri && (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={phase === 'error' ? onRetry : doCapture}
              activeOpacity={0.8}
            />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  baselineFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  baselineFlashImage: {
    width: '100%',
    height: '100%',
  },
  flashSpinner: {
    position: 'absolute',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  messageBox: {
    position: 'absolute',
    top: 48,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  message: { color: '#fff', fontSize: 18, textAlign: 'center', fontWeight: '500' },
  strikeLegend: { marginTop: 12, alignItems: 'flex-start' },
  strikeLegendLine: { color: '#fff', fontSize: 14, marginTop: 4 },
  strikeX: { color: '#c00', fontSize: 22, fontWeight: '800' },
  errorBox: {
    left: 24,
    right: 24,
    backgroundColor: 'rgba(180,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: { color: '#fff', fontSize: 14 },
  debugScroll: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    maxHeight: 300,
  },
  debugContainer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
    alignItems: 'center',
  },
  debugImageBox: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 8,
  },
  debugImageLabel: {
    color: '#fff',
    fontSize: 12,
    marginBottom: 8,
  },
  debugImage: {
    width: 200,
    height: 267,
    backgroundColor: '#333',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#000',
  },
  permissionText: { fontSize: 16, marginBottom: 16 },
  button: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16 },
  backButton: { marginTop: 24 },
  backText: { fontSize: 16, color: '#666' },
});
