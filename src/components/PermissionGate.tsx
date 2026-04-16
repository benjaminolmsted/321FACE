import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getPermissionGateBodyCopy,
  getPermissionGateCta,
  type PermissionGateMode,
} from '../utils/cameraPermissionGate';

type Props = {
  gateMode: PermissionGateMode;
  busy: boolean;
  onGrant: () => void;
  onCancel: () => void;
};

export function PermissionGateLoading() {
  return (
    <View style={styles.wrapper}>
      <Image source={require('../../assets/MASKS_ON_MARBLE.png')} style={styles.backgroundImage} resizeMode="cover" />
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#e6c44d" />
      </View>
    </View>
  );
}

export function PermissionGate({ gateMode, busy, onGrant, onCancel }: Props) {
  const bodyCopy = getPermissionGateBodyCopy(gateMode);
  const ctaLabel = getPermissionGateCta(gateMode);

  return (
    <View style={styles.wrapper}>
      <Image source={require('../../assets/MASKS_ON_MARBLE.png')} style={styles.backgroundImage} resizeMode="cover" />
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.title}>Let's get your face in the game!</Text>
          <Text style={styles.body}>{bodyCopy}</Text>
          <Text style={styles.privacy}>
            Your photos stay on your phone—we don't use a server and we don't track you.
          </Text>
        </View>
        <TouchableOpacity style={[styles.ctaButton, busy && styles.ctaButtonDisabled]} onPress={onGrant} disabled={busy}>
          {busy ? (
            <ActivityIndicator size="small" color="#5d4d26" />
          ) : (
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    marginBottom: 14,
    color: '#f5e9c9',
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 18,
    marginBottom: 14,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 25,
  },
  privacy: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 22,
  },
  ctaButton: {
    backgroundColor: '#d4b86a',
    borderWidth: 3,
    borderColor: '#6b5a32',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 160,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaText: { color: '#5d4d26', fontSize: 16, fontWeight: '600' },
  cancelButton: {
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderWidth: 2,
    borderColor: '#d4b86a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  cancelText: { fontSize: 16, color: '#f5e9c9', fontWeight: '700' },
});
