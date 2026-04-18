import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, InteractionManager, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { BlendshapeResult } from '../services/BlendshapeService';
import { getInterOcularDistance } from '../services/BlendshapeService';
import type { ProcessResult } from '../services/FaceComparisonService';
import { saveFace, getFacesForRound, clearStoredFaces } from '../services/StorageService';
import { capturePhoto, flipAndSaveTemp, savePermImage, extractFeatures, compareAndDecide } from '../services/CaptureService';
import { timed, logBenchmark, type BenchmarkEntry } from '../utils/benchmark';
import { FaceOvalOverlay } from '../components/FaceOvalOverlay';
import { PermissionGate, PermissionGateLoading } from '../components/PermissionGate';
import { DebugScreen, type PreviousFaceDebug } from './DebugScreen';
import { StrikeScreen } from './StrikeScreen';
import { GameOverScreen, type StrikeDetail } from './GameOverScreen';
import { useCountdown3251 } from '../hooks/useCountdown3251';
import { useCamera } from '../context/CameraContext';
import { usePermissionGate } from '../hooks/usePermissionGate';
import type { FlowPhase } from '../context/FlowContext';
import type { FrameEntry } from '../types/export';

type GameState = 'playing' | 'processing' | 'debug' | 'strike' | 'gameOver';

type Props = {
  flowPhase: Extract<FlowPhase, { screen: 'game' }> | Extract<FlowPhase, { screen: 'gameLoading' }>;
  advance: (next: FlowPhase) => void;
};

interface CaptureEntry {
  timestamp: number;
  roundIndex: number;
  blendshapes?: number[];
  pose?: { pitchDeg: number; rollDeg: number; yawDeg: number } | null;
  scores?: ProcessResult['scores'];
  benchmarks?: ProcessResult['benchmarks'];
}

interface CaptureData {
  rawImageUri: string;
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
  const gameStyle = gameParams.gameStyle ?? '321face';

  const { cameraRef, cameraReady: cameraReadyFromContext } = useCamera();
  const goHome = useCallback(() => advance({ screen: 'home' }), [advance]);
  const { status, gateMode, busy, onGrant, onCancel } = usePermissionGate(goHome);

  const [gameState, setGameState] = useState<GameState>('playing');
  const [roundIndex, setRoundIndex] = useState(playMode ? 1 : 0);
  const [strikes, setStrikes] = useState(0);
  const [strikeHistory, setStrikeHistory] = useState<StrikeDetail[]>([]);
  const [captureData, setCaptureData] = useState<CaptureData | null>(null);
  const [resultFlash, setResultFlash] = useState<{
    imageUri: string;
    label: 'TILT' | 'ZOOM' | 'SAME' | 'NFD' | null;
    resultsReady: boolean;
    pendingGameOver?: boolean;
    tempPathToCleanup?: string;
  } | null>(null);
  const [lastBenchmarks, setLastBenchmarks] = useState<ProcessResult['benchmarks']>();
  const [baselineLandmarks, setBaselineLandmarks] = useState<{ x: number; y: number; z: number }[] | null>(null);
  const [baselineSourceSize, setBaselineSourceSize] = useState<{ width: number; height: number } | null>(null);
  const [overlaySize, setOverlaySize] = useState({ width: 0, height: 0 });
  const [allFrameEntries, setAllFrameEntries] = useState<FrameEntry[]>([]);
  const cameraReady = cameraReadyFromContext;
  const prePhases = gameStyle === 'snap' ? 1 : 3;
  const { phase, facePhase, label, start, clear: clearCountdown } = useCountdown3251(countdownMs, prePhases);
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
      return;
    }
    transition('processing');

    const bench: BenchmarkEntry[] = [];
    const t0 = performance.now();

    try {
      const docDir = FileSystem.documentDirectory;
      if (!docDir) { transition('playing'); return; }
      const ts = Date.now();

      const { result: photo, ms: captureMs } = await timed('capture', () => capturePhoto(cameraRef));
      bench.push({ label: 'capture', ms: captureMs });
      if (!photo) { transition('playing'); return; }

      const { result: flip, ms: flipMs } = await timed('flip', () => flipAndSaveTemp(photo.uri, docDir, ts));
      bench.push({ label: 'flip', ms: flipMs });

      if (isPlayMode) {
        transition('playing');
        clearCountdown();
        setResultFlash({
          imageUri: flip.tempLargePath,
          label: null,
          resultsReady: false,
          tempPathToCleanup: flip.tempLargePath,
        });
      }

      const { result: save, ms: saveMs } = await timed('save', () => savePermImage(flip.tempLargePath, photo.width, docDir, ts));
      bench.push({ label: 'save', ms: saveMs });

      const { result: features, ms: extractMs } = await timed('extract', () => extractFeatures(flip.tempLargePath));
      bench.push({ label: 'extract', ms: extractMs });

      if (!features) {
        if (isPlayMode) {
          const newStrikes = strikesRef.current + 1;
          const nfdEntry: StrikeDetail = {
            type: 'nfd',
            currentImageUri: save.permPath,
            roundIndex: roundIndexRef.current,
          };
          setStrikeHistory((prev) => [...prev, nfdEntry]);
          setStrikes(newStrikes);
          const nfdRd = roundIndexRef.current;
          roundIndexRef.current = nfdRd + 1;
          setRoundIndex(nfdRd + 1);
          clearCountdown();
          setResultFlash({
            imageUri: flip.tempLargePath,
            label: 'NFD',
            resultsReady: true,
            pendingGameOver: newStrikes >= maxStrikes,
            tempPathToCleanup: flip.tempLargePath,
          });
          if (newStrikes >= maxStrikes) {
            setStrikes(0);
          }
        } else {
          await FileSystem.deleteAsync(flip.tempLargePath, { idempotent: true });
          await FileSystem.deleteAsync(save.permPath, { idempotent: true });
          transition('playing');
        }
        return;
      }

      const rd = roundIndexRef.current;
      const { result: previousFaces, ms: loadMs } = await timed('loadFaces', () => getFacesForRound(rd));
      bench.push({ label: 'loadFaces', ms: loadMs });

      const { result: decision, ms: compareMs } = await timed('compare', async () =>
        compareAndDecide(features, previousFaces, { blendshapeThreshold, isPlayMode: !!isPlayMode })
      );
      bench.push({ label: 'compare', ms: compareMs });

      const totalMs = Math.round((performance.now() - t0) * 100) / 100;
      logBenchmark('Pipeline', { steps: bench, totalMs });

      const blendshapeResult = features.blendshapes;
      const result: ProcessResult = {
        strike: decision.strike,
        reason: decision.reason,
        benchmarks: decision.benchmarks,
        scores: decision.scores,
      };

      setLastBenchmarks(decision.benchmarks);

      const prevDebug: PreviousFaceDebug[] = previousFaces.map((f) => ({
        imageUri: f.imageUri,
        blendshapes: f.blendshapes ?? [],
        pose: f.facePose,
        round: f.roundIndex,
      }));

      captureLog.current.push({
        timestamp: Date.now(),
        roundIndex: rd,
        blendshapes: blendshapeResult.scores,
        pose: blendshapeResult.facePose ?? null,
        scores: result.scores,
        benchmarks: result.benchmarks,
      });

      if (isPlayMode) {
        const flashLabel = decision.strike
          ? (decision.reason === 'tilt' ? 'TILT' : decision.reason === 'zoom' ? 'ZOOM' : decision.reason === 'nfd' ? 'NFD' : 'SAME')
          : null;
        if (decision.strike) {
          const newStrikes = strikesRef.current + 1;
          const reason = decision.reason ?? 'similar';
          const previousImageUri =
            reason === 'similar' && decision.perFaceDistances.length > 0
              ? previousFaces[
                  decision.perFaceDistances.indexOf(Math.min(...decision.perFaceDistances))
                ]?.imageUri
              : reason === 'tilt' || reason === 'zoom'
                ? previousFaces[0]?.imageUri
                : undefined;

          const newEntry: StrikeDetail = {
            type: reason,
            currentImageUri: save.permPath,
            previousImageUri,
            currentBlendshapes: blendshapeResult.scores,
            roundIndex: rd,
          };
          setStrikeHistory((prev) => [...prev, newEntry]);
          setStrikes(newStrikes);
          roundIndexRef.current = rd + 1;
          setRoundIndex(rd + 1);
          setResultFlash({
            imageUri: flip.tempLargePath,
            label: flashLabel!,
            resultsReady: true,
            pendingGameOver: newStrikes >= maxStrikes,
            tempPathToCleanup: flip.tempLargePath,
          });
          if (newStrikes >= maxStrikes) {
            setStrikes(0);
          }
        } else {
          const savedIod = getInterOcularDistance(blendshapeResult.faceLandmarks);
          await saveFace({
            roundIndex: rd,
            imageUri: save.permPath,
            blendshapes: blendshapeResult.scores,
            faceLandmarks: blendshapeResult.faceLandmarks,
            facePose: blendshapeResult.facePose,
            sourceImageWidth: blendshapeResult.sourceImageWidth,
            sourceImageHeight: blendshapeResult.sourceImageHeight,
            interOcularDistance: savedIod || undefined,
            timestamp: Date.now(),
          });
          transition('playing', rd + 1);
          setResultFlash({
            imageUri: flip.tempLargePath,
            label: null,
            resultsReady: true,
            tempPathToCleanup: flip.tempLargePath,
          });
        }
      } else {
        setCaptureData({
          rawImageUri: save.permPath,
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

  useEffect(() => {
    if (!resultFlash || !resultFlash.resultsReady) return;
    const id = setTimeout(async () => {
      const wasGameOver = resultFlash.pendingGameOver;
      if (resultFlash.tempPathToCleanup) {
        await FileSystem.deleteAsync(resultFlash.tempPathToCleanup, { idempotent: true });
      }
      if (wasGameOver) {
        const stored = await getFacesForRound(roundIndexRef.current);
        const strikeEntries: FrameEntry[] = strikeHistory
          .map((s) => ({
            uri: s.currentImageUri,
            role: 'strike' as const,
            strikeType: s.type,
            roundIndex: s.roundIndex,
            blendshapes: s.currentBlendshapes ?? [],
          }));
        const passEntries: FrameEntry[] = stored.map((f) => ({
          uri: f.imageUri,
          role: 'pass' as const,
          roundIndex: f.roundIndex,
          blendshapes: f.blendshapes ?? [],
        }));
        const merged = [...strikeEntries, ...passEntries]
          .sort((a, b) => {
            if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
            return a.role === 'strike' ? -1 : 1;
          });
        setAllFrameEntries(merged);
        transition('gameOver');
      }
      setResultFlash(null);
    }, 500);
    return () => clearTimeout(id);
  }, [resultFlash, strikeHistory]);

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

  // --- Permission gate ---
  if (status === 'loading') return <PermissionGateLoading />;
  if (status === 'gate') return <PermissionGate gateMode={gateMode} busy={busy} onGrant={onGrant} onCancel={onCancel} />;

  // --- Game UI ---
  const showCameraUI = (cameraReady || baselineImageUri) && (gameState === 'playing' || gameState === 'processing' || !!resultFlash);

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
            <View style={styles.topBar}>
              <View style={styles.topBarLabelContainer}>
                <Text style={[styles.topBarText, styles.topBarTextShadow]}>Round {roundIndex + 1}</Text>
                <Text style={styles.topBarText}>Round {roundIndex + 1}</Text>
              </View>
              <View style={styles.topBarLabelContainer}>
                <Text style={[styles.topBarText, styles.topBarTextShadow]}>Strikes: {strikes} / {maxStrikes}</Text>
                <Text style={styles.topBarText}>Strikes: {strikes} / {maxStrikes}</Text>
              </View>
            </View>
            {(() => {
              const displayLabel = gameStyle === 'snap' ? (phase === facePhase ? 'SNAP' : '') : label;
              return displayLabel ? (
                <View style={styles.countdownBox}>
                  <View style={styles.countdownTextContainer}>
                    <Text style={[styles.countdownText, styles.countdownTextShadow]}>{displayLabel}</Text>
                    <Text style={styles.countdownText}>{displayLabel}</Text>
                  </View>
                </View>
              ) : null;
            })()}
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
          {resultFlash.label && (
            <View style={styles.resultFlashLabelContainer}>
              <View style={styles.resultFlashTextWrapper}>
                <Text style={[styles.resultFlashText, styles.resultFlashTextShadow]}>{resultFlash.label}</Text>
                <Text style={styles.resultFlashText}>{resultFlash.label}</Text>
              </View>
            </View>
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
          {label && phase !== facePhase && baselineLandmarks && overlaySize.width > 0 && baselineSourceSize && !resultFlash && (
            <FaceOvalOverlay
              landmarks={baselineLandmarks}
              width={overlaySize.width}
              height={overlaySize.height}
              sourceImageWidth={baselineSourceSize.width}
              sourceImageHeight={baselineSourceSize.height}
              previewScaleMode="fill"
              mirror={false}
              stroke="#e6c44d"
              strokeWidth={3}
            />
          )}
          <View style={styles.topBar}>
            <View style={styles.topBarLabelContainer}>
              <Text style={[styles.topBarText, styles.topBarTextShadow]}>Round {roundIndex + 1}</Text>
              <Text style={styles.topBarText}>Round {roundIndex + 1}</Text>
            </View>
            <View style={styles.topBarLabelContainer}>
              <Text style={[styles.topBarText, styles.topBarTextShadow]}>Strikes: {strikes} / {maxStrikes}</Text>
              <Text style={styles.topBarText}>Strikes: {strikes} / {maxStrikes}</Text>
            </View>
          </View>
          {(() => {
            const displayLabel = gameStyle === 'snap' ? (phase === facePhase ? 'SNAP' : '') : label;
            return displayLabel && !resultFlash ? (
              <View style={styles.countdownBox}>
                <View style={styles.countdownTextContainer}>
                  <Text style={[styles.countdownText, styles.countdownTextShadow]}>{displayLabel}</Text>
                  <Text style={styles.countdownText}>{displayLabel}</Text>
                </View>
              </View>
            ) : null;
          })()}
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
          <GameOverScreen strikes={strikeHistory} allFrameEntries={allFrameEntries} onPlayAgain={handlePlayAgain} />
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
  resultFlashLabelContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultFlashTextWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  resultFlashText: {
    fontSize: 96,
    fontWeight: 'bold',
    letterSpacing: 2,
    color: '#c00',
  },
  resultFlashTextShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    color: 'rgba(0,0,0,0.5)',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(128, 128, 128, 0.75)',
  },
  topBarLabelContainer: {
    position: 'relative',
  },
  topBarText: {
    fontSize: 20,
    color: '#e6c44d',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  topBarTextShadow: {
    position: 'absolute',
    top: 1,
    left: 1,
    color: 'rgba(0,0,0,0.5)',
  },
  bottomBar: { position: 'absolute', bottom: 48, left: 0, right: 0, alignItems: 'center' },
  captureButton: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#fff', borderWidth: 4, borderColor: '#000',
  },
  benchmarkStrip: {
    position: 'absolute', bottom: 100, left: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
  },
  benchmarkText: { color: '#fff', fontSize: 11 },
  countdownBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownTextContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 96,
    color: '#e6c44d',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  countdownTextShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    color: 'rgba(0,0,0,0.5)',
  },
});
