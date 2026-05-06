import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import Share from 'react-native-share';

const HIGH_SCORE_KEY = '@321face_highScore';
import { concatListToVideo } from '../services/VideoExportService';
import {
  buildExportManifest,
  renderManifestOverlays,
  buildConcatList,
  cleanupExportDir,
} from '../services/ExportManifestService';
import { timed, logBenchmark, type BenchmarkEntry } from '../utils/benchmark';
import { DEFAULT_MANIFEST_CONFIG, type FrameEntry } from '../types/export';
import { getFaceEmoji } from '../utils/faceTiers';

export type StrikeDetail = {
  type: 'similar' | 'tilt' | 'zoom' | 'nfd';
  currentImageUri: string;
  previousImageUri?: string;
  currentBlendshapes?: number[];
  roundIndex: number;
};

type Props = {
  strikes: StrikeDetail[];
  allFrameEntries: FrameEntry[];
  onPlayAgain: () => void;
};

type ExportPhase = 'idle' | 'preparing' | 'creating';

export function GameOverScreen({ strikes, allFrameEntries, onPlayAgain }: Props) {
  const totalFaces = allFrameEntries.filter((e) => e.role === 'pass').length;
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const [isNewHighScore, setIsNewHighScore] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(HIGH_SCORE_KEY).then((raw) => {
      const prev = raw ? parseInt(raw, 10) : 0;
      if (totalFaces > prev) {
        setIsNewHighScore(true);
        AsyncStorage.setItem(HIGH_SCORE_KEY, String(totalFaces));
      }
    });
  }, [totalFaces]);

  const handleExportVideo = useCallback(async () => {
    if (allFrameEntries.length === 0) return;
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to save the video.');
      return;
    }

    const docDir = FileSystem.documentDirectory;
    if (!docDir) { Alert.alert('Export Failed', 'No document directory.'); return; }

    setExportPhase('preparing');
    try {
      const bench: BenchmarkEntry[] = [];
      const config = { ...DEFAULT_MANIFEST_CONFIG };
      const manifest = buildExportManifest(allFrameEntries, config);

      const { result: { manifest: overlaid }, ms: overlayMs } = await timed('overlay', () =>
        renderManifestOverlays(manifest, docDir)
      );
      bench.push({ label: 'overlay', ms: overlayMs });

      setExportPhase('creating');

      const concatContent = buildConcatList(overlaid.frames);
      const { result: videoUri, ms: ffmpegMs } = await timed('ffmpeg', () =>
        concatListToVideo(
          concatContent,
          undefined,
          require('../../assets/vaporwave.mp3')
        )
      );
      bench.push({ label: 'ffmpeg', ms: ffmpegMs });

      const { ms: saveMs } = await timed('saveToLibrary', () =>
        MediaLibrary.saveToLibraryAsync(videoUri)
      );
      bench.push({ label: 'saveToLibrary', ms: saveMs });

      const totalMs = bench.reduce((sum, b) => sum + b.ms, 0);
      logBenchmark('Export', { steps: bench, totalMs });

      const shareMessage = `I got ${totalFaces} unique face${totalFaces !== 1 ? 's' : ''} in 321FACE!`;
      Alert.alert(
        'Export Complete',
        'Video saved to your photo library.',
        [
          {
            text: 'Share',
            onPress: async () => {
              try {
                const fileUri = videoUri.startsWith('file://') ? videoUri : `file://${videoUri}`;
                await Share.open({
                  url: fileUri,
                  message: shareMessage,
                  type: 'video/mp4',
                  failOnCancel: false,
                });
              } catch (e: any) {
                console.error('[GameOver] Share error:', e);
                Alert.alert('Share Failed', String(e?.message ?? e));
              } finally {
                await cleanupExportDir(docDir);
              }
            },
          },
          {
            text: 'OK',
            onPress: () => cleanupExportDir(docDir),
          },
        ],
      );
      setExportPhase('idle');
      return;
    } catch (err) {
      console.error('[GameOver] Video export error:', err);
      Alert.alert('Video Export Failed', 'Could not create or save the video.');
      await cleanupExportDir(docDir);
      setExportPhase('idle');
    }
  }, [allFrameEntries]);

  const canExportVideo = allFrameEntries.length > 0;
  const baselineUri = allFrameEntries[0]?.uri;
  const faceEmoji = getFaceEmoji(totalFaces);
  const uniqueFacesLabel = `${totalFaces} UNIQUE ${totalFaces === 1 ? 'FACE' : 'FACES'}`;

  const allFaceUris = allFrameEntries.map((e) => e.uri);
  const uriToFrame = Object.fromEntries(allFrameEntries.map((e) => [e.uri, e.roundIndex + 1]));

  const ImageWithBadge = ({ uri, style }: { uri: string; style?: object }) => {
    const frame = uriToFrame[uri];
    return (
      <View style={styles.imageWithBadge}>
        <Image source={{ uri }} style={style ?? styles.faceImage} resizeMode="cover" />
        {frame != null && (
          <View style={styles.frameBadge}>
            <Text style={styles.frameBadgeText}>{frame}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.wrapper}>
      <Image
        source={require('../../assets/MASKS_ON_MARBLE.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      {(exportPhase === 'preparing' || exportPhase === 'creating') && (
        <View style={styles.spinnerOverlay}>
          <ActivityIndicator size="large" color="#ffdd63" />
          <Text style={styles.spinnerLabel}>
            {exportPhase === 'preparing' ? 'Adding overlays...' : 'Creating video...'}
          </Text>
        </View>
      )}
      <View style={styles.body}>
      <View style={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={[styles.title, styles.titleShadow]}>GAME OVER</Text>
        <Text style={styles.title}>GAME OVER</Text>
      </View>
      <View style={styles.strikesList}>
        {strikes.map((strike, i) => (
          <View key={i} style={[styles.strikeCard, i > 0 && styles.strikeCardTightTop]}>
            <View style={styles.strikeCardRow}>
              <View style={styles.strikeTypeContainer}>
                <Text style={[styles.strikeType, styles.strikeTypeRotated]} numberOfLines={1}>
                  {strike.type === 'similar' ? 'SAME' : strike.type.toUpperCase()}
                </Text>
              </View>
              <View style={styles.strikeContent}>
                {strike.type === 'nfd' ? (
                  <View style={styles.similarRow}>
                    {baselineUri ? <ImageWithBadge uri={baselineUri} /> : null}
                    <ImageWithBadge uri={strike.currentImageUri} />
                  </View>
                ) : (strike.type === 'similar' || strike.type === 'tilt' || strike.type === 'zoom') && strike.previousImageUri ? (
                  <View style={styles.similarRow}>
                    <ImageWithBadge uri={strike.previousImageUri} />
                    <ImageWithBadge uri={strike.currentImageUri} />
                  </View>
                ) : (
                  <ImageWithBadge uri={strike.currentImageUri} style={styles.singleImage} />
                )}
              </View>
              <View style={[styles.strikeTypeContainer, styles.strikeTypeContainerRight]}>
                <Text style={[styles.strikeType, styles.strikeTypeRotated270]} numberOfLines={1}>
                  {strike.type === 'similar' ? 'SAME' : strike.type.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.highScoreContainer}>
          <Text style={[styles.highScoreText, styles.highScoreTextShadow]}>{isNewHighScore ? 'NEW HIGH SCORE!' : 'SCORE'}</Text>
          <Text style={styles.highScoreText}>{isNewHighScore ? 'NEW HIGH SCORE!' : 'SCORE'}</Text>
        </View>
        <View style={styles.scoreContainer}>
          <View style={styles.scoreLineRow}>
            <Text style={styles.gameOverEmoji}>
              {faceEmoji}
              {' '}
            </Text>
            <View style={styles.scoreGoldSegment}>
              <Text style={[styles.scoreText, styles.scoreTextShadow]}>{uniqueFacesLabel}</Text>
              <Text style={styles.scoreText}>{uniqueFacesLabel}</Text>
            </View>
            <Text style={styles.gameOverEmoji}>
              {' '}
              {faceEmoji}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={onPlayAgain} activeOpacity={0.8}>
        <Text style={[styles.buttonText, styles.playAgainButtonText]}>PLAY AGAIN</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.exportButton, exportPhase !== 'idle' && styles.buttonDisabled]}
        onPress={handleExportVideo}
        disabled={exportPhase !== 'idle'}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {exportPhase === 'preparing' ? 'Adding overlays...' : exportPhase === 'creating' ? 'Creating video...' : 'EXPORT VIDEO'}
        </Text>
      </TouchableOpacity>
      </View>
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
  body: { flex: 1, backgroundColor: 'transparent', width: '100%' },
  container: { alignItems: 'center', padding: 24, paddingBottom: 48, width: '100%' },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  spinnerLabel: {
    color: '#ffdd63',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  titleContainer: {
    position: 'relative',
    marginTop: 13,
    marginBottom: 4,
  },
  title: {
    fontSize: 48,
    color: '#c00',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  titleShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    color: 'rgba(0,0,0,0.5)',
  },
  gameOverEmoji: {
    fontSize: 15,
    lineHeight: 22,
  },
  scoreLineRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreGoldSegment: {
    position: 'relative',
  },
  scoreCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
    width: '100%',
  },
  highScoreContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  highScoreText: {
    fontSize: 16,
    color: '#ffdd63',
    fontWeight: '900',
    letterSpacing: 2,
  },
  highScoreTextShadow: {
    position: 'absolute',
    top: 1,
    left: 1,
    color: 'rgba(0,0,0,0.5)',
  },
  scoreContainer: {
    position: 'relative',
  },
  scoreText: {
    fontSize: 20,
    color: '#ffdd63',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  scoreTextShadow: {
    position: 'absolute',
    top: 1,
    left: 1,
    color: 'rgba(0,0,0,0.5)',
  },
  strikesList: { width: '100%', marginBottom: 0 },
  strikeCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingRight: 16,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderLeftColor: '#ffdd63',
    borderRightColor: '#ffdd63',
  },
  /** Pulls the next card up 1px to remove the hairline gap between stacked rounded rects. */
  strikeCardTightTop: {
    marginTop: -1,
  },
  strikeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  strikeTypeContainer: {
    width: 75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  strikeTypeContainerRight: {
    marginRight: -10,
  },
  strikeType: {
    color: '#c00',
    fontWeight: 'bold',
    fontSize: 21,
    flexShrink: 0,
  },
  strikeTypeRotated: {
    transform: [{ translateX: -20 }, { rotate: '-90deg' }],
  },
  strikeTypeRotated270: {
    transform: [{ translateX: 20 }, { rotate: '90deg' }],
  },
  strikeContent: {
    flex: 1,
  },
  similarRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  imageSlot: { alignItems: 'center' },
  imageLabel: { fontSize: 12, color: '#6b5a32', marginBottom: 4 },
  imageWithBadge: { position: 'relative' },
  faceImage: { width: 100, height: 100, borderRadius: 8 },
  frameBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(107, 90, 50, 0.9)',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  frameBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  contentBox: { alignItems: 'center' },
  contentText: { fontSize: 18, fontWeight: 'bold', color: '#c00' },
  contentSubtext: { fontSize: 14, color: '#000', marginBottom: 8 },
  nfdPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: 'rgba(200, 200, 200, 0.3)',
    borderWidth: 2,
    borderColor: '#c00',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nfdPlaceholderText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#c00',
  },
  singleImage: { width: 120, height: 120, borderRadius: 8, marginTop: 4 },
  button: {
    backgroundColor: '#d4b86a',
    borderWidth: 3,
    borderColor: '#6b5a32',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  exportButton: {
    backgroundColor: '#d4b86a',
    borderColor: '#6b5a32',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: '#5d4d26',
    fontSize: 18,
    fontWeight: '600',
  },
  playAgainButtonText: {
    fontWeight: '900',
  },
});
