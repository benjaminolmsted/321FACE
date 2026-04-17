import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import { PermissionGate, PermissionGateLoading } from '../components/PermissionGate';
import {
  flipBaselineForDisplay,
  processBaselineFromTemp,
} from '../services/BaselineCaptureService';
import { clearStoredFaces } from '../services/StorageService';
import { useCamera } from '../context/CameraContext';
import { usePermissionGate } from '../hooks/usePermissionGate';
import type { FlowPhase } from '../context/FlowContext';

const BASELINE_FLASH_DELAY_MS = 500;

type Props = {
  flowPhase: Extract<FlowPhase, { screen: 'baseline' }>;
  advance: (next: FlowPhase) => void;
};

export function BaselineCaptureScreen({ flowPhase, advance }: Props) {
  const { phase, gameParams } = flowPhase;
  const goBack = useCallback(() => advance({ screen: 'home' }), [advance]);
  const { cameraRef, cameraReady } = useCamera();
  const { status, gateMode, busy, onGrant, onCancel } = usePermissionGate(goBack);

  const [capturing, setCapturing] = useState(false);
  const [flashResult, setFlashResult] = useState<{
    faceLandmarks: { x: number; y: number; z: number }[];
    sourceImageWidth: number;
    sourceImageHeight: number;
  } | null>(null);
  const [flashOverlaySize, setFlashOverlaySize] = useState({ width: 0, height: 0 });
  const [showMarbleSplash, setShowMarbleSplash] = useState(true);

  const error = phase === 'error' && flowPhase.data?.kind === 'error' ? flowPhase.data : null;
  const displayUri = phase === 'flash' && flowPhase.data?.kind === 'flash' ? flowPhase.data.displayUri : null;

  useEffect(() => {
    clearStoredFaces();
  }, []);

  useEffect(() => {
    if (phase !== 'capture' || displayUri) return;
    setShowMarbleSplash(true);
    const id = setTimeout(() => setShowMarbleSplash(false), 500);
    return () => clearTimeout(id);
  }, [phase, displayUri]);

  useEffect(() => {
    if (phase === 'error') setCapturing(false);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'flash') setFlashResult(null);
  }, [phase]);

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
    return () => { cancelled = true; };
  }, [phase, flowPhase.data, gameParams, advance]);

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

  // --- Permission gate ---
  if (status === 'loading') return <PermissionGateLoading />;
  if (status === 'gate') return <PermissionGate gateMode={gateMode} busy={busy} onGrant={onGrant} onCancel={onCancel} />;

  // --- Camera UI ---
  return (
    <View style={styles.wrapper}>
      {(error || (showMarbleSplash && !displayUri)) && (
        <Image
          source={require('../../assets/MASKS_ON_MARBLE.png')}
          style={styles.backgroundImage}
          resizeMode="cover"
        />
      )}
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
        {cameraReady && !showMarbleSplash && !displayUri && (
        <View style={styles.messageBox}>
          <Text style={styles.message}>
            Capture the baseline pose you want to use for this run
          </Text>
          <Text style={styles.strikeTypesTitle}>STRIKE TYPES</Text>
          <View style={styles.strikeLegend}>
            <Text style={styles.strikeLegendLine}>
              <Text style={styles.strikeLegendType}>SAME</Text> - face too similar to a previous face
            </Text>
            <Text style={styles.strikeLegendLine}>
              <Text style={styles.strikeLegendType}>TILT</Text> - tilting face too much from baseline
            </Text>
            <Text style={styles.strikeLegendLine}>
              <Text style={styles.strikeLegendType}>ZOOM</Text> - zooming face in or out too much
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
          {cameraReady && !showMarbleSplash && !displayUri && !capturing && (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={phase === 'error' ? onRetry : doCapture}
              activeOpacity={0.8}
            >
              <Text style={styles.captureButtonText}>CAPTURE</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
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
  messageBox: {
    position: 'absolute',
    top: 48,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderLeftColor: '#e6c44d',
    borderRightColor: '#e6c44d',
  },
  message: {
    color: '#6b5a32',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  strikeTypesTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#c00',
    textAlign: 'center',
  },
  strikeLegend: { marginTop: 4, alignItems: 'flex-start' },
  strikeLegendLine: { color: '#000', fontSize: 14, marginTop: 4 },
  strikeLegendType: { color: '#c00', fontWeight: 'bold' },
  errorBox: {
    left: 24,
    right: 24,
    backgroundColor: 'rgba(255,255,255,0.95)',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderLeftColor: '#c00',
    borderRightColor: '#c00',
  },
  errorText: { color: '#c00', fontSize: 14, fontWeight: '600' },
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
    backgroundColor: 'rgba(255,255,255,0.92)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e6c44d',
  },
  debugImageLabel: {
    color: '#6b5a32',
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
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
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#d4b86a',
    borderWidth: 4,
    borderColor: '#6b5a32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonText: {
    color: '#5d4d26',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
