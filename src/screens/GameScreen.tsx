import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import FaceDetection from '@react-native-ml-kit/face-detection';
import type { Face } from '@react-native-ml-kit/face-detection';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractEmbeddingWithTiming } from '../services/FaceNetService';
import { alignFaceFromMLKit } from '../utils/faceAlignment';
import { extractBlendshapes, type BlendshapeResult } from '../services/BlendshapeService';
import { processCapturedFace, type ProcessResult } from '../services/FaceComparisonService';
import { saveFace, getFacesForRound, clearStoredFaces } from '../services/StorageService';
import { GAME_CONFIG, COMPARISON_STRATEGIES } from '../utils/constants';
import { DebugScreen, type PreviousFaceDebug } from './DebugScreen';
import { StrikeScreen } from './StrikeScreen';

type GameState = 'playing' | 'processing' | 'debug' | 'strike';

interface CaptureEntry {
  timestamp: number;
  roundIndex: number;
  inputHash: string;
  embedding: number[];
  blendshapes?: number[];
  scores?: ProcessResult['scores'];
  benchmarks?: ProcessResult['benchmarks'];
}

interface CaptureData {
  rawImageUri: string;
  faceNetInputUri: string;
  inputHash: string;
  embedding?: number[];
  blendshapes?: BlendshapeResult;
  face: Face;
  result: ProcessResult;
  previousFaces: PreviousFaceDebug[];
}

export function GameScreen() {
  const navigation = useNavigation();
  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const [permission, requestPermission] = useCameraPermissions();

  const [gameState, setGameState] = useState<GameState>('playing');
  const [roundIndex, setRoundIndex] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [lastBenchmarks, setLastBenchmarks] = useState<ProcessResult['benchmarks']>();

  const cameraRef = useRef<CameraView>(null);
  const gameStateRef = useRef<GameState>('playing');
  const roundIndexRef = useRef(0);
  const captureLog = useRef<CaptureEntry[]>([]);

  useEffect(() => {
    clearStoredFaces();
  }, []);

  function transition(state: GameState, round?: number) {
    gameStateRef.current = state;
    setGameState(state);
    if (round !== undefined) {
      roundIndexRef.current = round;
      setRoundIndex(round);
    }
  }

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || gameStateRef.current !== 'playing') {
      console.log('[321FACE] Guard:', { cam: !!cameraRef.current, state: gameStateRef.current });
      return;
    }
    transition('processing');

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9, base64: false });
      if (!photo?.uri) { transition('playing'); return; }

      const docDir = FileSystem.documentDirectory;
      if (!docDir) { transition('playing'); return; }

      const permPath = `${docDir}face_${Date.now()}.jpg`;
      const flipped = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: flipped.uri, to: permPath });

      const tMlKit0 = performance.now();
      const faces = await FaceDetection.detect(permPath, {
        landmarkMode: 'all',
        contourMode: 'all',
        classificationMode: 'all',
      });
      const mlKitMs = performance.now() - tMlKit0;

      if (!faces || faces.length === 0) {
        console.log('[321FACE] No faces detected');
        transition('playing');
        return;
      }

      const face = faces[0];
      const rd = roundIndexRef.current;
      const previousFaces = await getFacesForRound(rd);

      let embedding: number[] | undefined;
      let faceNetTiming: { align: number; convertRgb: number; modelRun: number; total: number } | undefined;
      let alignedImageUri: string | undefined;
      let inputHash = '';
      let blendshapeResult: BlendshapeResult | null = null;

      // Run FaceNet and MediaPipe blendshapes in parallel
      const embeddingPromise = COMPARISON_STRATEGIES.includes('embedding')
        ? extractEmbeddingWithTiming(permPath, face)
        : alignFaceFromMLKit(permPath, face).then((a) => a ? { alignedOnly: true, uri: a.uri } : null);

      const blendshapePromise = extractBlendshapes(permPath);

      const [embResult, bsResult] = await Promise.all([embeddingPromise, blendshapePromise]);

      if (embResult && 'embedding' in embResult) {
        embedding = embResult.embedding;
        faceNetTiming = embResult.timingMs;
        alignedImageUri = embResult.alignedImageUri;
        inputHash = embResult.inputHash;
      } else if (embResult && 'uri' in embResult) {
        alignedImageUri = embResult.uri;
      }

      blendshapeResult = bsResult;

      const benchmarks: ProcessResult['benchmarks'] = { mlKitMs, faceNetMs: faceNetTiming };

      const result = await processCapturedFace(face, permPath, embedding, previousFaces, benchmarks);

      setLastBenchmarks(result.benchmarks);

      const prevDebug: PreviousFaceDebug[] = previousFaces.map((f) => ({
        imageUri: f.imageUri,
        inputHash: f.inputHash ?? '',
        embedding: f.embedding ?? [],
        blendshapes: f.blendshapes ?? [],
        round: f.roundIndex,
      }));

      captureLog.current.push({
        timestamp: Date.now(),
        roundIndex: rd,
        inputHash,
        embedding: embedding ?? [],
        blendshapes: blendshapeResult?.scores,
        scores: result.scores,
        benchmarks: result.benchmarks,
      });

      setCaptureData({
        rawImageUri: permPath,
        faceNetInputUri: alignedImageUri ?? permPath,
        inputHash,
        embedding,
        blendshapes: blendshapeResult ?? undefined,
        face,
        result,
        previousFaces: prevDebug,
      });
      transition('debug');
    } catch (err) {
      console.error('[321FACE] captureAndProcess error:', err);
      transition('playing');
    }
  }, []);

  const handleDebugContinue = useCallback(async () => {
    const data = captureData;
    if (!data) { transition('playing'); return; }
    setCaptureData(null);

    if (data.result.strike) {
      transition('strike');
    } else {
      const rd = roundIndexRef.current;
      await saveFace({
        roundIndex: rd,
        imageUri: data.rawImageUri,
        face: data.face,
        embedding: data.embedding,
        blendshapes: data.blendshapes?.scores,
        inputHash: data.inputHash || undefined,
        timestamp: Date.now(),
      });
      transition('playing', rd + 1);
    }
  }, [captureData]);

  const handleStrikeContinue = useCallback(() => {
    const newStrikes = strikes + 1;
    setStrikes(newStrikes);
    if (newStrikes >= GAME_CONFIG.MAX_STRIKES) {
      clearStoredFaces();
      setStrikes(0);
      transition('playing', 0);
      goBack();
    } else {
      const rd = roundIndexRef.current;
      transition('playing', rd + 1);
    }
  }, [strikes, goBack]);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
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

  const showCameraUI = gameState === 'playing' || gameState === 'processing';

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="front" />

      {showCameraUI && (
        <View style={styles.overlay} pointerEvents="box-none">
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
              />
            )}
          </View>
          {lastBenchmarks && (
            <View style={styles.benchmarkStrip}>
              <Text style={styles.benchmarkText}>
                ML Kit: {lastBenchmarks.mlKitMs?.toFixed(0)}ms
                {lastBenchmarks.faceNetMs && ` | FaceNet: ${lastBenchmarks.faceNetMs.total.toFixed(0)}ms`}
                {captureData?.blendshapes && ` | Blendshapes: ${captureData.blendshapes.timingMs.toFixed(0)}ms`}
              </Text>
            </View>
          )}
        </View>
      )}

      {gameState === 'debug' && captureData && (
        <View style={styles.fullOverlay}>
          <DebugScreen
            rawImageUri={captureData.rawImageUri}
            faceNetInputUri={captureData.faceNetInputUri}
            inputHash={captureData.inputHash}
            currentEmbedding={captureData.embedding ?? []}
            currentBlendshapes={captureData.blendshapes ?? undefined}
            previousFaces={captureData.previousFaces}
            scores={captureData.result.scores}
            onContinue={handleDebugContinue}
            onDumpLog={() => console.log(JSON.stringify(captureLog.current))}
          />
        </View>
      )}

      {gameState === 'strike' && captureData && (
        <View style={styles.fullOverlay}>
          <StrikeScreen
            reason={captureData.result.reason ?? 'similar'}
            currentImageUri={captureData.rawImageUri}
            previousImageUri={captureData.previousFaces[captureData.previousFaces.length - 1]?.imageUri}
            strikes={strikes + 1}
            onContinue={handleStrikeContinue}
            benchmarks={captureData.result.benchmarks}
            scores={captureData.result.scores}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  fullOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  backBtn: { position: 'absolute', top: 48, left: 16, zIndex: 10 },
  backBtnText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  topBar: { position: 'absolute', top: 48, left: 0, right: 0, alignItems: 'center' },
  roundText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  strikesText: { color: '#fff', fontSize: 14, marginTop: 4 },
  bottomBar: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', borderWidth: 4, borderColor: '#000',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  permissionText: { fontSize: 16, marginBottom: 16 },
  button: { backgroundColor: '#000', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16 },
  backButton: { marginTop: 24 },
  backText: { fontSize: 16, color: '#666' },
  benchmarkStrip: {
    position: 'absolute', bottom: 100, left: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  benchmarkText: { color: '#fff', fontSize: 11 },
});
