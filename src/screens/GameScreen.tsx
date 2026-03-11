import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, InteractionManager, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { extractBlendshapes, blendshapeDistance, getInterOcularDistance, type BlendshapeResult } from '../services/BlendshapeService';
import type { ProcessResult } from '../services/FaceComparisonService';
import { saveFace, getFacesForRound, clearStoredFaces } from '../services/StorageService';
import { GAME_CONFIG, BLENDSHAPE_DISTANCE_THRESHOLD, CAPTURE_MAX_WIDTH, INTER_OCULAR_ZOOM_THRESHOLD } from '../utils/constants';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import { DebugScreen, type PreviousFaceDebug } from './DebugScreen';
import { StrikeScreen } from './StrikeScreen';
import { GameOverScreen, type StrikeDetail } from './GameOverScreen';
import { useCountdown3251 } from '../hooks/useCountdown3251';
import { useCamera } from '../context/CameraContext';
import type { FlowPhase } from '../context/FlowContext';

type GameState = 'playing' | 'processing' | 'debug' | 'strike' | 'gameOver';

type Props = {
  flowPhase: Extract<FlowPhase, { screen: 'game' }> | Extract<FlowPhase, { screen: 'gameLoading' }>;
  advance: (next: FlowPhase) => void;
};

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

export function GameScreen({ flowPhase, advance }: Props) {
  const gameParams = flowPhase.screen === 'gameLoading' ? flowPhase.data.gameParams : flowPhase.gameParams;
  const baselineImageUri = flowPhase.screen === 'gameLoading' ? flowPhase.data.imageUri : flowPhase.baselineImageUri;

  const playMode = gameParams.playMode;
  const blendshapeThreshold = gameParams.blendshapeThreshold;
  const maxStrikes = gameParams.maxStrikes;
  const countdownMs = gameParams.countdownMs;

  const goBack = useCallback(() => {
    advance({ screen: 'baseline', phase: 'capture', gameParams });
  }, [advance, gameParams]);
  const { cameraRef, cameraReady: cameraReadyFromContext, permission, requestPermission } = useCamera();

  const [gameState, setGameState] = useState<GameState>('playing');
  const [roundIndex, setRoundIndex] = useState(playMode ? 1 : 0);
  const [strikes, setStrikes] = useState(0);
  const [strikeHistory, setStrikeHistory] = useState<StrikeDetail[]>([]);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [resultFlash, setResultFlash] = useState<{
    imageUri: string;
    label: 'TILT' | 'ZOOM' | 'STRIKE' | null;
    resultsReady: boolean;
    pendingGameOver?: boolean;
    /** Temp full-size file to delete when flash is cleared */
    tempPathToCleanup?: string;
  } | null>(null);
  const [lastBenchmarks, setLastBenchmarks] = useState<ProcessResult['benchmarks']>();
  const [baselineLandmarks, setBaselineLandmarks] = useState<{ x: number; y: number; z: number }[] | null>(null);
  const [baselineSourceSize, setBaselineSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const [allFaceUris, setAllFaceUris] = useState<string[]>([]);
  const cameraReady = cameraReadyFromContext;
  console.log('[321FACE] GameScreen render', {
    screen: flowPhase.screen,
    hasBaselineUri: !!baselineImageUri,
    uriPrefix: baselineImageUri?.slice(0, 80),
    cameraReady,
    modalCondition: !!(baselineImageUri && !cameraReady),
  });
  const { phase, label, start } = useCountdown3251(countdownMs);
  const gameStateRef = useRef<GameState>('playing');
  const roundIndexRef = useRef(playMode ? 1 : 0);
  const strikesRef = useRef(0);
  const captureLog = useRef<CaptureEntry[]>([]);
  strikesRef.current = strikes;

  useEffect(() => {
    if (!playMode) clearStoredFaces();
  }, [playMode]);

  useEffect(() => {
    if (cameraReady && baselineImageUri) {
      FileSystem.deleteAsync(baselineImageUri, { idempotent: true });
      if (flowPhase.screen === 'gameLoading') {
        advance({ screen: 'game', phase: 'countdown', gameParams });
      }
    }
  }, [cameraReady, baselineImageUri, flowPhase.screen, gameParams, advance]);

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
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, base64: false, shutterSound: false });
      if (!photo?.uri) { transition('playing'); return; }
      console.log('[321FACE] Captured photo dimensions:', photo.width, 'x', photo.height);

      const docDir = FileSystem.documentDirectory;
      if (!docDir) { transition('playing'); return; }

      const ts = Date.now();
      const tempLargePath = `${docDir}face_temp_large_${ts}.jpg`;
      const permPath = `${docDir}face_${ts}.jpg`;

      // 1. Flip full-size → temp (for blendshape extraction and result flash display)
      const flippedFull = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ flip: ImageManipulator.FlipType.Horizontal }],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
      );
      await FileSystem.copyAsync({ from: flippedFull.uri, to: tempLargePath });

      if (isPlayMode) {
        transition('playing');
        setResultFlash({
          imageUri: tempLargePath,
          label: null,
          resultsReady: false,
          tempPathToCleanup: tempLargePath,
        });
      }

      // 2. Create smaller permanent copy for storage and video export
      if (photo.width > CAPTURE_MAX_WIDTH) {
        const resized = await ImageManipulator.manipulateAsync(
          tempLargePath,
          [{ resize: { width: CAPTURE_MAX_WIDTH } }],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
        );
        await FileSystem.copyAsync({ from: resized.uri, to: permPath });
      } else {
        await FileSystem.copyAsync({ from: tempLargePath, to: permPath });
      }

      // 3. Extract blendshapes from full-size image
      const blendshapeResult = await extractBlendshapes(tempLargePath);

      if (!blendshapeResult) {
        console.log('[321FACE] CAPTURE no face', { imageUri: permPath });
        await FileSystem.deleteAsync(tempLargePath, { idempotent: true });
        await FileSystem.deleteAsync(permPath, { idempotent: true });
        if (isPlayMode) setResultFlash(null);
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
      const tiltStrike = pose && (
        Math.abs(pose.pitchDeg) > tiltThreshold ||
        Math.abs(pose.rollDeg) > tiltThreshold ||
        Math.abs(pose.yawDeg) > tiltThreshold
      );
      const blendshapeStrike = minDist != null && minDist < blendshapeThreshold;

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
        const flashLabel = strike ? (result.reason === 'tilt' ? 'TILT' : result.reason === 'zoom' ? 'ZOOM' : 'STRIKE') : null;
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

          const newEntry: StrikeDetail = {
            type: reason,
            currentImageUri: permPath,
            previousImageUri,
            currentBlendshapes: blendshapeResult.scores,
            roundIndex: rd,
          };
          setStrikeHistory((prev) => [...prev, newEntry]);
          setStrikes(newStrikes);
          setResultFlash({
            imageUri: tempLargePath,
            label: flashLabel!,
            resultsReady: true,
            pendingGameOver: newStrikes >= maxStrikes,
            tempPathToCleanup: tempLargePath,
          });
          if (newStrikes >= maxStrikes) {
            setStrikes(0);
            // Defer clearStoredFaces to handlePlayAgain so allFaceUris can be built for video export
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
          setResultFlash({
            imageUri: tempLargePath,
            label: null,
            resultsReady: true,
            tempPathToCleanup: tempLargePath,
          });
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
  }, [blendshapeThreshold]);

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
    advance({ screen: 'home' });
  }, [advance]);

  const handleStrikeContinue = useCallback(() => {
    setCaptureData(null);
    const newStrikes = strikes + 1;
    setStrikes(newStrikes);
    if (newStrikes >= maxStrikes) {
      clearStoredFaces();
      setStrikes(0);
      advance({ screen: 'baseline', phase: 'capture', gameParams });
    } else {
      const rd = roundIndexRef.current;
      transition('playing', rd + 1);
    }
  }, [strikes, maxStrikes, advance, gameParams]);

  // Result flash: 0.5s from when results are ready, then dismiss and allow countdown to start
  useEffect(() => {
    if (!resultFlash || !resultFlash.resultsReady) return;
    const id = setTimeout(async () => {
      const wasGameOver = resultFlash.pendingGameOver;
      if (resultFlash.tempPathToCleanup) {
        await FileSystem.deleteAsync(resultFlash.tempPathToCleanup, { idempotent: true });
      }
      setResultFlash(null);
      if (wasGameOver) {
        const stored = await getFacesForRound(roundIndexRef.current);
        const strikeItems = strikeHistory.map((s) => ({ roundIndex: s.roundIndex, imageUri: s.currentImageUri, isStrike: true as const }));
        const passItems = stored.map((f) => ({ roundIndex: f.roundIndex, imageUri: f.imageUri, isStrike: false as const }));
        const merged = [...strikeItems, ...passItems]
          .sort((a, b) => {
            if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
            return a.isStrike ? -1 : 1; // strike before pass in same round
          })
          .map((x) => x.imageUri);
        setAllFaceUris(merged);
        transition('gameOver');
      }
    }, 500);
    return () => clearTimeout(id);
  }, [resultFlash, strikeHistory]);

  // Auto-start countdown in play mode (no manual capture).
  // Start when we have something to show: camera ready, or baseline image (while camera warms up).
  // On first entry (round 1), also defer until after layout for full countdown visibility.
  useEffect(() => {
    if (
      (cameraReady || baselineImageUri) &&
      playMode &&
      gameState === 'playing' &&
      phase === null &&
      roundIndex >= 1 &&
      !resultFlash
    ) {
      const run = () => start({ onFace: () => captureAndProcess(true) });
      if (roundIndex === 1) {
        const handle = InteractionManager.runAfterInteractions(run);
        return () => handle.cancel();
      }
      run();
    }
  }, [cameraReady, baselineImageUri, playMode, gameState, phase, roundIndex, resultFlash, start, captureAndProcess]);

  // When we have baselineImageUri (coming from Baseline Captured), show it immediately
  // instead of a black loading screen while permission resolves.
  if (!permission && !baselineImageUri) {
    return <View style={styles.center}><ActivityIndicator size="large" /></View>;
  }

  if (permission && !permission.granted) {
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

  const showCameraUI = (cameraReady || baselineImageUri) && (gameState === 'playing' || gameState === 'processing' || !!resultFlash);
  const showFaceOval = playMode && baselineLandmarks && overlaySize.width > 0 && phase !== null;

  return (
    <View style={styles.container}>
      {baselineImageUri && !cameraReady && (
        <View style={styles.baselineWarmupOverlay} pointerEvents="box-none">
          <Image
            source={{
              uri: Platform.OS === 'android' && !baselineImageUri.startsWith('file://')
                ? `file://${baselineImageUri}`
                : baselineImageUri,
            }}
            style={styles.baselineWarmupImage}
            resizeMode="cover"
          />
          <View style={styles.overlay} pointerEvents="box-none">
            <TouchableOpacity style={styles.backBtn} onPress={goBack}>
              <Text style={styles.backBtnText}>← Back</Text>
            </TouchableOpacity>
            <View style={styles.topBar}>
              <Text style={styles.roundText}>Round {roundIndex + 1}</Text>
              <Text style={styles.strikesText}>Strikes: {strikes} / {maxStrikes}</Text>
            </View>
            {label && countdownMs >= 200 && (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownText}>{label}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {resultFlash && (
        <View style={styles.resultFlashOverlay} pointerEvents="none">
          <Image
            source={{ uri: resultFlash.imageUri }}
            style={styles.resultFlashImage}
            resizeMode="cover"
          />
          {baselineLandmarks && overlaySize.width > 0 && baselineSourceSize && (
            <FaceOvalOverlay
              landmarks={baselineLandmarks}
              width={overlaySize.width}
              height={overlaySize.height}
              sourceImageWidth={baselineSourceSize.width}
              sourceImageHeight={baselineSourceSize.height}
              previewScaleMode="fill"
              mirror={false}
            />
          )}
          {resultFlash.label && (
            <Text style={styles.resultFlashText}>{resultFlash.label}</Text>
          )}
        </View>
      )}

      {showCameraUI && (
        <View
          style={styles.overlay}
          pointerEvents="box-none"
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setOverlaySize({ width, height });
          }}
        >
          {baselineLandmarks && overlaySize.width > 0 && (showFaceOval || !playMode) && !resultFlash && (
            <FaceOvalOverlay
              landmarks={baselineLandmarks}
              width={overlaySize.width}
              height={overlaySize.height}
              sourceImageWidth={baselineSourceSize?.width}
              sourceImageHeight={baselineSourceSize?.height}
              previewScaleMode="fill"
              mirror={false}
            />
          )}
          <TouchableOpacity style={styles.backBtn} onPress={goBack}>
            <Text style={styles.backBtnText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.topBar}>
            <Text style={styles.roundText}>Round {roundIndex + 1}</Text>
            <Text style={styles.strikesText}>
              Strikes: {strikes} / {maxStrikes}
            </Text>
          </View>
          {label && !resultFlash && countdownMs >= 200 && (
            <View style={styles.countdownBox}>
              <Text style={styles.countdownText}>{label}</Text>
            </View>
          )}
          <View style={styles.bottomBar}>
            {gameState === 'processing' && !playMode ? (
              <ActivityIndicator size="large" color="#fff" />
            ) : !playMode && phase === null ? (
              <TouchableOpacity
                style={styles.captureButton}
                onPress={() => captureAndProcess()}
              />
            ) : null}
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
            maxStrikes={maxStrikes}
            onContinue={handleStrikeContinue}
            benchmarks={captureData.result.benchmarks}
            scores={captureData.result.scores}
            previousFaces={captureData.previousFaces}
            currentBlendshapes={captureData.blendshapes?.scores}
          />
        </View>
      )}

      {gameState === 'gameOver' && strikeHistory.length > 0 && (
        <View style={styles.fullOverlay}>
          <GameOverScreen strikes={strikeHistory} totalFaces={roundIndex} allFaceUris={allFaceUris} onPlayAgain={handlePlayAgain} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  fullOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  baselineWarmupOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    elevation: 999,
    backgroundColor: '#000',
  },
  baselineWarmupImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  resultFlashOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 12,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultFlashImage: {
    width: '100%',
    height: '100%',
  },
  resultFlashText: {
    position: 'absolute',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#c00',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
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
