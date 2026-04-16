import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useCamera } from '../context/CameraContext';
import {
  loadDenialCount,
  incrementDenialCount,
  clearDenialCount,
  resetDenialCountAfterSettings,
  getPermissionGateMode,
  type PermissionGateMode,
} from '../utils/cameraPermissionGate';

export type PermissionGateStatus = 'loading' | 'granted' | 'gate';

export type PermissionGateResult = {
  status: PermissionGateStatus;
  gateMode: PermissionGateMode;
  busy: boolean;
  onGrant: () => Promise<void>;
  onCancel: () => void;
};

/**
 * Centralised permission gate logic.
 *
 * Uses a persisted denial count to work around expo-camera bug (expo/expo#23805)
 * where canAskAgain incorrectly reports false for Android's "Ask every time".
 *
 * Android cannot permanently deny after a single system dialog interaction, so:
 *   - 1st denial (count was 0) → go home (definitely not permanent)
 *   - 2nd+ denial (count was 1+) → show "Open Settings" (might be permanent)
 *
 * Once showSettingsBridge is set, tapping "Open Settings" goes straight to
 * Linking.openSettings() without calling requestPermission().
 */
export function usePermissionGate(goHome: () => void): PermissionGateResult {
  const { permission, requestPermission } = useCamera();
  const [denialCount, setDenialCount] = useState(0);
  const denialCountRef = useRef(0);
  const [showSettingsBridge, setShowSettingsBridge] = useState(false);
  const [flagsLoaded, setFlagsLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const sentToSettingsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadDenialCount().then((count) => {
      if (!cancelled) {
        setDenialCount(count);
        denialCountRef.current = count;
        setFlagsLoaded(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // When the user returns from phone settings, give them a fresh chance.
  // We don't know what they changed there, so reset to rationale mode
  // (count = 1) and let the grant effect handle it if they enabled the camera.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && sentToSettingsRef.current) {
        sentToSettingsRef.current = false;
        console.log('[321FACE][Perm][resumeFromSettings] resetting gate state');
        setShowSettingsBridge(false);
        void resetDenialCountAfterSettings().then((count) => {
          setDenialCount(count);
          denialCountRef.current = count;
        });
      }
    });
    return () => sub.remove();
  }, []);

  // When permission becomes granted, reset session-only flags.
  // Only clear the persisted denial count for PERMANENT grants (canAskAgain: false).
  // "Only this time" grants (canAskAgain: true) are temporary — the user will need
  // to go through the gate again when the process restarts.
  useEffect(() => {
    console.log('[321FACE][Perm][grantEffect]', {
      granted: permission?.granted,
      canAskAgain: permission?.canAskAgain,
      denialCount,
      showSettingsBridge,
    });
    if (permission?.granted) {
      setShowSettingsBridge(false);
      if (permission.canAskAgain === false) {
        console.log('[321FACE][Perm][grantEffect] permanent grant — clearing all flags');
        setDenialCount(0);
        denialCountRef.current = 0;
        void clearDenialCount();
      } else {
        console.log('[321FACE][Perm][grantEffect] temporary grant (Only this time) — keeping denialCount');
      }
    }
  }, [permission?.granted, permission?.canAskAgain]);

  const gateMode: PermissionGateMode = useMemo(
    () => getPermissionGateMode(denialCount, showSettingsBridge),
    [denialCount, showSettingsBridge],
  );

  const status: PermissionGateStatus =
    !permission || !flagsLoaded ? 'loading' :
    permission.granted ? 'granted' :
    'gate';

  useEffect(() => {
    console.log('[321FACE][Perm][state]', {
      status,
      gateMode,
      granted: permission?.granted,
      canAskAgain: permission?.canAskAgain,
      denialCount,
      showSettingsBridge,
      flagsLoaded,
      busy,
    });
  }, [status, gateMode, permission?.granted, permission?.canAskAgain, denialCount, showSettingsBridge, flagsLoaded, busy]);

  const onGrant = useCallback(async () => {
    if (busy) return;
    setBusy(true);

    try {
      if (showSettingsBridge || denialCountRef.current >= 2) {
        console.log('[321FACE][Perm][onGrant] settings mode — opening Settings directly, denialCount:', denialCountRef.current);
        sentToSettingsRef.current = true;
        await Linking.openSettings();
        return;
      }

      console.log('[321FACE][Perm][onGrant] calling requestPermission, denialCount:', denialCountRef.current);
      const result = await requestPermission();
      console.log('[321FACE][Perm][onGrant] result:', {
        granted: result?.granted,
        canAskAgain: result?.canAskAgain,
      });

      if (result?.granted) {
        console.log('[321FACE][Perm][onGrant] granted', {
          canAskAgain: result.canAskAgain,
          permanent: result.canAskAgain === false,
        });
        return;
      }

      const countBefore = denialCountRef.current;
      const newCount = await incrementDenialCount();
      setDenialCount(newCount);
      denialCountRef.current = newCount;

      if (result?.canAskAgain === false && countBefore >= 1) {
        console.log('[321FACE][Perm][onGrant] 2nd+ denial with canAskAgain=false — showing settings');
        setShowSettingsBridge(true);
        return;
      }

      console.log('[321FACE][Perm][onGrant] denial #' + newCount + ' — going home');
      goHome();
    } finally {
      setBusy(false);
    }
  }, [busy, requestPermission, showSettingsBridge, goHome]);

  return { status, gateMode, busy, onGrant, onCancel: goHome };
}
