import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, getInterOcularDistance } from '../services/BlendshapeService';
import { saveFace, clearStoredFaces } from '../services/StorageService';

export function BaselineCaptureScreen() {
  const navigation = useNavigation();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    clearStoredFaces();
  }, []);

  const doCapture = useCallback(async () => {
    if (!cameraRef.current) return;
    setLoading(true);
    setError(null);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      if (!photo?.uri) {
        setLoading(false);
        return;
      }

      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        setLoading(false);
        return;
      }

      const permPath = `${docDir}face_baseline_${Date.now()}.jpg`;
      const flipped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: flipped.uri, to: permPath });

      const result = await extractBlendshapes(permPath);

      if (!result) {
        setError('No face detected. Try again.');
        setLoading(false);
        return;
      }

      const interOcularDistance = getInterOcularDistance(result.faceLandmarks);

      console.log('[321FACE] CAPTURE baseline', {
        imageUri: permPath,
        interOcularDistance,
        pitchDeg: result.facePose?.pitchDeg,
        rollDeg: result.facePose?.rollDeg,
      });

      await saveFace({
        roundIndex: 0,
        imageUri: permPath,
        blendshapes: result.scores,
        faceLandmarks: result.faceLandmarks,
        facePose: result.facePose,
        sourceImageWidth: result.sourceImageWidth,
        sourceImageHeight: result.sourceImageHeight,
        interOcularDistance: interOcularDistance || undefined,
        timestamp: Date.now(),
      });

      (navigation as any).navigate('Game', { playMode: true });
    } catch (err) {
      console.error('[BaselineCapture] error:', err);
      setError('Capture failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, [navigation]);

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
      <CameraView style={styles.camera} ref={cameraRef} facing="front" />

      <View style={styles.overlay} pointerEvents="box-none">
        <TouchableOpacity style={styles.backBtn} onPress={goBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.messageBox}>
          <Text style={styles.message}>
            Capture the pose you want to use for this run
          </Text>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.bottomBar}>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={doCapture}
              disabled={loading}
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
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { position: 'absolute', top: 48, left: 16, zIndex: 10 },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  messageBox: {
    position: 'absolute',
    top: '30%',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  message: { color: '#fff', fontSize: 18, textAlign: 'center', fontWeight: '500' },
  errorBox: {
    position: 'absolute',
    bottom: 140,
    left: 24,
    right: 24,
    backgroundColor: 'rgba(180,0,0,0.8)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: { color: '#fff', fontSize: 14 },
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
