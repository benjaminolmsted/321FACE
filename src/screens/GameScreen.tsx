import { useCallback, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import FaceDetection from '@react-native-ml-kit/face-detection';
import * as FileSystem from 'expo-file-system/legacy';
import { extractEmbedding } from '../services/FaceNetService';
import { processCapturedFace } from '../services/FaceComparisonService';
import { saveFace, getFacesForRound, clearStoredFaces } from '../services/StorageService';
import { GAME_CONFIG, COMPARISON_STRATEGIES } from '../utils/constants';
import { StrikeScreen } from './StrikeScreen';

type GameState = 'playing' | 'processing' | 'strike' | 'gameover';

export function GameScreen() {
  const navigation = useNavigation();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const [permission, requestPermission] = useCameraPermissions();
  const [roundIndex, setRoundIndex] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [gameState, setGameState] = useState<GameState>('playing');
  const [strikeReason, setStrikeReason] = useState<'similar' | 'tilt'>('similar');
  const [currentImageUri, setCurrentImageUri] = useState<string>('');
  const [previousImageUri, setPreviousImageUri] = useState<string | undefined>();
  const cameraRef = useRef<CameraView>(null);

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || gameState !== 'playing') return;

    setGameState('processing');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        base64: false,
      });

      if (!photo?.uri) {
        setGameState('playing');
        return;
      }

      // Copy to permanent storage (camera uri is temporary)
      const docDir = FileSystem.documentDirectory;
      if (!docDir) {
        setGameState('playing');
        return;
      }
      const permPath = `${docDir}face_${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: photo.uri, to: permPath });

      const faces = await FaceDetection.detect(permPath, {
        landmarkMode: 'all',
        contourMode: 'all',
        classificationMode: 'all',
      });

      if (!faces || faces.length === 0) {
        setGameState('playing');
        return;
      }

      const face = faces[0];
      const previousFaces = await getFacesForRound(roundIndex);

      let embedding: number[] | undefined;
      if (COMPARISON_STRATEGIES.includes('embedding')) {
        const extracted = await extractEmbedding(permPath, face);
        embedding = extracted ?? undefined;
      }

      const result = await processCapturedFace(
        face,
        permPath,
        embedding,
        previousFaces
      );

      if (result.strike) {
        setStrikeReason(result.reason ?? 'similar');
        setCurrentImageUri(permPath);
        setPreviousImageUri(previousFaces[previousFaces.length - 1]?.imageUri);
        setStrikes((s) => s + 1);
        setGameState('strike');
        return;
      }

      await saveFace({
        roundIndex,
        imageUri: permPath,
        face,
        embedding,
        timestamp: Date.now(),
      });

      setRoundIndex((r) => r + 1);
      setGameState('playing');
    } catch (err) {
      console.error(err);
      setGameState('playing');
    }
  }, [gameState, roundIndex]);

  const handleContinue = useCallback(() => {
    if (strikes >= 3) {
      clearStoredFaces();
      setRoundIndex(0);
      setStrikes(0);
      setGameState('playing');
      goBack();
    } else {
      setRoundIndex((r) => r + 1);
      setGameState('playing');
    }
  }, [strikes, goBack]);

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

  if (gameState === 'strike') {
    return (
      <StrikeScreen
        reason={strikeReason}
        currentImageUri={currentImageUri}
        previousImageUri={previousImageUri}
        strikes={strikes}
        onContinue={handleContinue}
      />
    );
  }

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="front">
        <View style={styles.overlay}>
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topBar}>
            <Text style={styles.roundText}>Round {roundIndex + 1}</Text>
            <Text style={styles.strikesText}>
              Strikes: {strikes} / {GAME_CONFIG.MAX_STRIKES}
            </Text>
          </View>
          <View style={styles.bottomBar}>
            {gameState === 'processing' ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={captureAndProcess}
                disabled={gameState !== 'playing'}
              />
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 16,
    zIndex: 10,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  roundText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  strikesText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 4,
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  backButton: {
    marginTop: 24,
  },
  backText: {
    fontSize: 16,
    color: '#666',
  },
});
