import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, blendshapeDistance, getInterOcularDistance, type BlendshapeResult } from '../services/BlendshapeService';
import type { ProcessResult } from '../services/FaceComparisonService';
import { saveFace, getFacesForRound, clearStoredFaces } from '../services/StorageService';
import { GAME_CONFIG, BLENDSHAPE_DISTANCE_THRESHOLD, INTER_OCULAR_ZOOM_THRESHOLD } from '../utils/constants';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import { DebugScreen, type PreviousFaceDebug } from './DebugScreen';
import { StrikeScreen } from './StrikeScreen';
import { GameOverScreen, type StrikeDetail } from './GameOverScreen';
import { useCountdown3251 } from '../hooks/useCountdown3251';

type GameState = 'playing' | 'processing' | 'debug' | 'strike' | 'gameOver';

interface CaptureEntry {
  timestamp: number;
  roundIndex: number;
  inputHash: string;
  embedding: number[];
  blendshapes?: number[];
  pose?: { pitchDeg: number; rollDeg: number; yawDeg: number } | null;
  scores?: ProcessResult['scores'];
  benchmarks?: ProcessResult['benchmarks'];
}

interface CaptureData {
  rawImageUri: string;
  faceNetInputUri: string;
  inputHash: string;
  embedding?: number[];
  blendshapes?: BlendshapeResult;
  result: ProcessResult;
  previousFaces: PreviousFaceDebug[];
}

type RouteParams = { playMode?: boolean };

export function GameScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const playMode = (route.params as RouteParams | undefined)?.playMode ?? false;

  const goBack = useCallback(() => navigation.goBack(), [navigation]);
  const [permission, requestPermission] = useCameraPermissions();

  const [gameState, setGameState] = useState<GameState>('playing');
  const [roundIndex, setRoundIndex] = useState(playMode ? 1 : 0);
  const [strikes, setStrikes] = useState(0);
  const [strikeHistory, setStrikeHistory] = useState<StrikeDetail[]>([]);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [lastBenchmarks, setLastBenchmarks] = useState<ProcessResult['benchmarks']>();
  const [baselineLandmarks, setBaselineLandmarks] = useState<{ x: number; y: number; z: number }[] | null>(null);
  const [baselineSourceSize, setBaselineSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });

  const { phase, label, start } = useCountdown3251();
  const cameraRef = useRef<CameraView>(null);
  const gameStateRef = useRef<GameState>('playing');
  const roundIndexRef = useRef(playMode ? 1 : 0);
  const strikesRef = useRef(0);
  const captureLog = useRef<CaptureEntry[]>([]);
  strikesRef.current = strikes;

  useEffect(() => {
    if (!playMode) clearStoredFaces();
  }, [playMode]);

  // Load baseline landmarks and source size when we have previous faces (round > 0)
  useEffect(() => {
    if (roundIndex === 0) {
      setBaselineLandmarks(null);
      setBaselineSourceSize(null);
      return;
    }
    getFacesForRound(roundIndex).then((faces) => {
      const first = faces[0];
      setBaselineLandmarks(first?.faceLandmarks ?? null);
      setBaselineSourceSize(
        first?.sourceImageWidth != null && first?.sourceImageHeight != null
          ? { width: first.sourceImageWidth, height: first.sourceImageHeight }
          : null
      );
    });
  }, [roundIndex]);

  function transition(state: GameState, round?: number) {
    gameStateRef.current = state;
    setGameState(state);
    if (round !== undefined) {
      roundIndexRef.current = round;
      setRoundIndex(round);
    }
  }

  const captureAndProcess = useCallback(async (isPlayMode?: boolean) => {
    if (!cameraRef.current || gameStateRef.current !== 'playing') {
      console.log('[321FACE] Guard:', { cam: !!cameraRef.current, state: gameStateRef.current });
      return;
    }
    console.log('[321FACE] CAPTURE attempt', { playMode: !!isPlayMode, round: roundIndexRef.current + 1 });
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

      const blendshapeResult = await extractBlendshapes(permPath);

      if (!blendshapeResult) {
        console.log('[321FACE] CAPTURE no face', { imageUri: permPath });
        transition('playing');
        return;
      }

      const rd = roundIndexRef.current;
      const previousFaces = await getFacesForRound(rd);

      const perFaceDistances: number[] = [];
      for (const prev of previousFaces) {
        if (prev.blendshapes?.length) {
          perFaceDistances.push(blendshapeDistance(blendshapeResult.scores, prev.blendshapes));
        }
      }
      const minDist = perFaceDistances.length > 0 ? Math.min(...perFaceDistances) : null;
      const pose = blendshapeResult.facePose;
      const tiltThreshold = GAME_CONFIG.TILT_THRESHOLD_DEGREES;
      const tiltStrike = pose && (Math.abs(pose.pitchDeg) > tiltThreshold || Math.abs(pose.rollDeg) > tiltThreshold);
      const blendshapeStrike = minDist != null && minDist < BLENDSHAPE_DISTANCE_THRESHOLD;

      const baseline = previousFaces[0];
      const baselineIod = baseline?.interOcularDistance ?? 0;
      const currentIod = getInterOcularDistance(blendshapeResult.faceLandmarks);
      const zoomStrike = !!(
        isPlayMode &&
        baselineIod > 0 &&
        currentIod > 0 &&
        Math.abs(currentIod - baselineIod) / baselineIod > INTER_OCULAR_ZOOM_THRESHOLD
      );

      const strike = isPlayMode ? (blendshapeStrike || !!tiltStrike || zoomStrike) : false;

      const benchmarks: ProcessResult['benchmarks'] = {
        mlKitMs: 0,
        blendshapeMs: blendshapeResult.timingMs,
      };

      const scores: ProcessResult['scores'] = {};
      if (minDist != null) scores.blendshape = { minDistance: minDist, perFace: perFaceDistances };
      if (pose) scores.pose = { pitchDeg: pose.pitchDeg, rollDeg: pose.rollDeg, yawDeg: pose.yawDeg, tiltStrike: !!tiltStrike };
      if (baselineIod > 0 && currentIod > 0) {
        scores.interOcular = { baseline: baselineIod, current: currentIod, zoomStrike: !!zoomStrike };
      }

      const result: ProcessResult = {
        strike,
        reason: strike ? (tiltStrike ? 'tilt' : zoomStrike ? 'zoom' : 'similar') : undefined,
        benchmarks,
        scores: Object.keys(scores).length > 0 ? scores : undefined,
      };

      setLastBenchmarks(benchmarks);

      const prevDebug: PreviousFaceDebug[] = previousFaces.map((f) => ({
        imageUri: f.imageUri,
        inputHash: f.inputHash ?? '',
        embedding: f.embedding ?? [],
        blendshapes: f.blendshapes ?? [],
        pose: f.facePose,
        round: f.roundIndex,
      }));

      const logEntry = {
        timestamp: Date.now(),
        roundIndex: rd,
        inputHash: '',
        embedding: [],
        blendshapes: blendshapeResult.scores,
        pose: pose ?? null,
        scores: result.scores,
        benchmarks: result.benchmarks,
      };
      captureLog.current.push(logEntry);

      console.log('[321FACE] CAPTURE', {
        playMode: !!isPlayMode,
        round: rd + 1,
        strike: result.strike,
        reason: result.reason,
        imageUri: permPath,
        minDist: minDist ?? undefined,
        tiltStrike: !!tiltStrike,
        zoomStrike: !!zoomStrike,
      });

      if (isPlayMode) {
        transition('playing');
        if (strike) {
          const newStrikes = strikesRef.current + 1;
          const reason = result.reason ?? 'similar';
          const previousImageUri =
            reason === 'similar' && perFaceDistances.length > 0
              ? previousFaces[
                  perFaceDistances.indexOf(Math.min(...perFaceDistances))
                ]?.imageUri
              : reason === 'tilt' || reason === 'zoom'
                ? previousFaces[0]?.imageUri
                : undefined;

          setStrikeHistory((prev) => [
            ...prev,
            { type: reason, currentImageUri: permPath, previousImageUri },
          ]);
          setStrikes(newStrikes);

          if (newStrikes >= GAME_CONFIG.MAX_STRIKES) {
            clearStoredFaces();
            setStrikes(0);
            transition('gameOver');
          }
        } else {
          const savedIod = getInterOcularDistance(blendshapeResult.faceLandmarks);
          await saveFace({
            roundIndex: rd,
            imageUri: permPath,
            blendshapes: blendshapeResult.scores,
            faceLandmarks: blendshapeResult.faceLandmarks,
            facePose: blendshapeResult.facePose,
            sourceImageWidth: blendshapeResult.sourceImageWidth,
            sourceImageHeight: blendshapeResult.sourceImageHeight,
            interOcularDistance: savedIod || undefined,
            inputHash: '',
            timestamp: Date.now(),
          });
          transition('playing', rd + 1);
        }
      } else {
        setCaptureData({
          rawImageUri: permPath,
          faceNetInputUri: permPath,
          inputHash: '',
          blendshapes: blendshapeResult,
          result,
          previousFaces: prevDebug,
        });
        transition('debug');
      }
    } catch (err) {
      console.error('[321FACE] captureAndProcess error:', err);
      transition('playing');
    }
  }, []);

  const handleDebugContinue = useCallback(async () => {
    const data = captureData;
    if (!data) { transition('playing'); return; }

    if (data.result.strike) {
      transition('strike');
      // Keep captureData for StrikeScreen
    } else {
      setCaptureData(null);
      const rd = roundIndexRef.current;
      await saveFace({
        roundIndex: rd,
        imageUri: data.rawImageUri,
        blendshapes: data.blendshapes?.scores,
        faceLandmarks: data.blendshapes?.faceLandmarks,
        facePose: data.blendshapes?.facePose,
        sourceImageWidth: data.blendshapes?.sourceImageWidth,
        sourceImageHeight: data.blendshapes?.sourceImageHeight,
        inputHash: data.inputHash || undefined,
        timestamp: Date.now(),
      });
      transition('playing', rd + 1);
    }
  }, [captureData]);

  const handlePlayAgain = useCallback(() => {
    clearStoredFaces();
    (navigation as any).reset({ index: 0, routes: [{ name: 'Home' }] });
  }, [navigation]);

  const handleStrikeContinue = useCallback(() => {
    setCaptureData(null);
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
  const showFaceOval = playMode && baselineLandmarks && overlaySize.width > 0 && (phase === 0 || phase === 1);

  return (
    <View style={styles.container}>
      <CameraView style={styles.camera} ref={cameraRef} facing="front" />

      {showCameraUI && (
        <View
          style={styles.overlay}
          pointerEvents="box-none"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setOverlaySize({ width, height });
          }}
        >
          {baselineLandmarks && overlaySize.width > 0 && (showFaceOval || !playMode) && (
            <FaceOvalOverlay
              landmarks={baselineLandmarks}
              width={overlaySize.width}
              height={overlaySize.height}
              sourceImageWidth={baselineSourceSize?.width}
              sourceImageHeight={baselineSourceSize?.height}
              mirror={playMode}
            />
          )}
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topBar}>
            <Text style={styles.roundText}>Round {roundIndex + 1}</Text>
            <Text style={styles.strikesText}>
              Strikes: {strikes} / {GAME_CONFIG.MAX_STRIKES}
            </Text>
          </View>
          {label && (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownText}>{label}</Text>
            </View>
          )}
          <View style={styles.bottomBar}>
            {gameState === 'processing' ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : phase !== null ? null : (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={() =>
                  playMode
                    ? start({ onFace: () => captureAndProcess(true) })
                    : captureAndProcess()
                }
              />
            )}
          </View>
          {!playMode && lastBenchmarks && (
            <View style={styles.benchmarkStrip}>
              <Text style={styles.benchmarkText}>
                {lastBenchmarks.mlKitMs ? `ML Kit: ${lastBenchmarks.mlKitMs.toFixed(0)}ms` : ''}
                {lastBenchmarks.faceNetMs ? ` | FaceNet: ${lastBenchmarks.faceNetMs.total.toFixed(0)}ms` : ''}
                {lastBenchmarks.blendshapeMs != null ? `Blendshapes: ${lastBenchmarks.blendshapeMs.toFixed(0)}ms` : ''}
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

      {gameState === 'gameOver' && strikeHistory.length >= 3 && (
        <View style={styles.fullOverlay}>
          <GameOverScreen strikes={strikeHistory} onPlayAgain={handlePlayAgain} />
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
  countdownBox: {
    position: 'absolute',
    top: '40%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownText: { color: '#fff', fontSize: 64, fontWeight: 'bold' },
});
