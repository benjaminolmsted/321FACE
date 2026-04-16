import AsyncStorage from '@react-native-async-storage/async-storage';

const DENIAL_COUNT_KEY = '@321face_cameraDenialCount';

export type PermissionGateMode = 'disclosure' | 'rationale' | 'settings';

/**
 * Determine which permission gate UI to show.
 *
 * - 'disclosure': first time (prominent disclosure per Google Play policy)
 * - 'rationale': user denied at least once (educational "why we need this")
 * - 'settings': confirmed likely-permanent denial THIS SESSION after
 *               requestPermission() returned {granted:false, canAskAgain:false}
 *               on the 2nd+ denial
 *
 * We use a persisted denial count instead of expo's canAskAgain because of
 * expo-camera bug (expo/expo#23805) which reports canAskAgain:false for
 * Android's "Ask every time" option. Android cannot permanently deny after
 * a single system dialog interaction, so denialCount lets us distinguish
 * first-denial (always go home) from 2nd+ denial (might be permanent).
 */
export function getPermissionGateMode(
  denialCount: number,
  showSettingsBridge: boolean,
): PermissionGateMode {
  if (showSettingsBridge || denialCount >= 2) return 'settings';
  if (denialCount >= 1) return 'rationale';
  return 'disclosure';
}

export function getPermissionGateBodyCopy(mode: PermissionGateMode): string {
  if (mode === 'settings') {
    return "It looks like camera access is turned off. You'll need to enable it in your phone settings to play.";
  }
  if (mode === 'rationale') {
    return "We can't detect face collisions without the camera. Would you like to enable it now?";
  }
  return '321FACE captures photos for your stop-motion video. Photos are processed on-device and never uploaded.';
}

export function getPermissionGateCta(mode: PermissionGateMode): string {
  return mode === 'settings' ? 'Open Settings' : 'Grant Access';
}

export async function loadDenialCount(): Promise<number> {
  const v = await AsyncStorage.getItem(DENIAL_COUNT_KEY);
  return v ? parseInt(v, 10) || 0 : 0;
}

export async function incrementDenialCount(): Promise<number> {
  const current = await loadDenialCount();
  const next = current + 1;
  await AsyncStorage.setItem(DENIAL_COUNT_KEY, String(next));
  return next;
}

export async function resetDenialCountAfterSettings(): Promise<number> {
  await AsyncStorage.setItem(DENIAL_COUNT_KEY, '1');
  return 1;
}

export async function clearDenialCount(): Promise<void> {
  await AsyncStorage.removeItem(DENIAL_COUNT_KEY);
}
