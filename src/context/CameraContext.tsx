/**
 * Shared CameraView provider. Keeps the camera mounted across baseline, gameLoading,
 * and game phases so it stays warm when transitioning from capture to game.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFlow } from './FlowContext';

type CameraContextValue = {
  cameraRef: React.RefObject<CameraView | null>;
  cameraReady: boolean;
  permission: { granted: boolean; canAskAgain?: boolean } | null;
  requestPermission: () => Promise<{ granted: boolean; canAskAgain?: boolean } | null>;
};

const CameraContext = createContext<CameraContextValue | null>(null);

const CAMERA_SCREENS = ['baseline', 'gameLoading', 'game'] as const;

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const { flowPhase } = useFlow();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const showCamera =
    CAMERA_SCREENS.includes(flowPhase.screen as (typeof CAMERA_SCREENS)[number]) &&
    (permission?.granted ?? false);

  useEffect(() => {
    if (!showCamera) {
      setCameraReady(false);
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
  };

  return (
    <CameraContext.Provider value={value}>
      <View style={styles.container}>
        {showCamera && (
          <View style={styles.cameraLayer} pointerEvents="none">
            <CameraView
              ref={cameraRef}
              style={styles.camera}
              facing="front"
              onCameraReady={onCameraReady}
            />
          </View>
        )}
        {children}
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
});
