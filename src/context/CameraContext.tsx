/**
 * Shared CameraView provider. Keeps the camera mounted while on the game screen
 * so it stays warm across baseline capture and gameplay.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFlow } from './FlowContext';

type CameraContextValue = {
  cameraRef: React.RefObject<CameraView | null>;
  cameraReady: boolean;
  permission: { granted: boolean; canAskAgain?: boolean } | null;
  requestPermission: () => Promise<{ granted: boolean; canAskAgain?: boolean } | null>;
  /** Hide the native preview (e.g. full-screen opaque overlays like game over) to avoid visible cross-fade. */
  setCameraPreviewSuppressed: (suppressed: boolean) => void;
};

const CameraContext = createContext<CameraContextValue | null>(null);

const CAMERA_SCREENS = ['game'] as const;

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const { flowPhase } = useFlow();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraPreviewSuppressed, setCameraPreviewSuppressed] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const setCameraPreviewSuppressedStable = useCallback((suppressed: boolean) => {
    setCameraPreviewSuppressed(suppressed);
  }, []);

  const showCamera =
    CAMERA_SCREENS.includes(flowPhase.screen as (typeof CAMERA_SCREENS)[number]) &&
    (permission?.granted ?? false);

  const renderCamera = showCamera && !cameraPreviewSuppressed;

  useEffect(() => {
    if (!showCamera) {
      setCameraReady(false);
      setCameraPreviewSuppressed(false);
    }
  }, [showCamera]);

  const onCameraReady = useCallback(() => setCameraReady(true), []);

  // On resume, do a READ-ONLY permission refresh (no system dialog).
  // This handles returning from Settings — if user enabled camera there,
  // permission.granted updates and the gate UI disappears automatically.
  // We intentionally do NOT call requestPermission() here because:
  // 1. The system dialog dismiss also triggers AppState 'active', causing double-prompts
  // 2. The screen CTA buttons handle actual permission requests
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      console.log('[321FACE][Perm][Resume] calling getPermission...');
      void getPermission().then((result) => {
        console.log('[321FACE][Perm][Resume] getPermission result:', {
          granted: result?.granted,
          canAskAgain: result?.canAskAgain,
          status: result?.status,
        });
      });
    });
    return () => sub.remove();
  }, [getPermission]);

  const value: CameraContextValue = {
    cameraRef,
    cameraReady,
    permission,
    requestPermission,
    setCameraPreviewSuppressed: setCameraPreviewSuppressedStable,
  };

  return (
    <CameraContext.Provider value={value}>
      <View style={styles.container}>
        {renderCamera && (
          <View style={styles.cameraLayer} pointerEvents="none">
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              onCameraReady={onCameraReady}
            />
          </View>
        )}
        {/* RN views must stack above the native camera preview (esp. Android SurfaceView) */}
        <View style={styles.uiLayer} pointerEvents="box-none" collapsable={false}>
          {children}
        </View>
      </View>
    </CameraContext.Provider>
  );
}

export function useCamera() {
  const ctx = useContext(CameraContext);
  if (!ctx) throw new Error('useCamera must be used within CameraProvider');
  return ctx;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  cameraLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  camera: { flex: 1 },
  uiLayer: {
    flex: 1,
    zIndex: 1,
    ...(Platform.OS === 'android' ? { elevation: 8 } : {}),
  },
});
