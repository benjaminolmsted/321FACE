/**
 * Shared CameraView provider. Keeps the camera mounted across baseline, gameLoading,
 * and game phases so it stays warm when transitioning from capture to game.
 */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFlow } from './FlowContext';

type CameraContextValue = {
  cameraRef: React.RefObject<CameraView | null>;
  cameraReady: boolean;
  permission: { granted: boolean } | null;
  requestPermission: () => Promise<{ granted: boolean } | null>;
};

const CameraContext = createContext<CameraContextValue | null>(null);

const CAMERA_SCREENS = ['baseline', 'gameLoading', 'game'] as const;

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const { flowPhase } = useFlow();
  const [permission, requestPermission] = useCameraPermissions();
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
