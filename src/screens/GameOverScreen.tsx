import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { cleanupTempMarkedPaths, markFaceUrisWithLabels } from '../services/ImageMarkingService';
import { imagesToVideo } from '../services/VideoExportService';

export type StrikeDetail = {
  type: 'similar' | 'tilt' | 'zoom';
  currentImageUri: string;
  previousImageUri?: string;
  currentBlendshapes?: number[];
  /** Round when strike occurred; used for temporal ordering (strike before pass in same round) */
  roundIndex: number;
};

type Props = {
  strikes: StrikeDetail[];
  totalFaces: number;
  /** Faces in temporal order (strike before pass in same round) for video export */
  allFaceUris: string[];
  onPlayAgain: () => void;
};

type ExportPhase = 'idle' | 'preparing' | 'preview' | 'creating';

export function GameOverScreen({ strikes, totalFaces, allFaceUris, onPlayAgain }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportPhase, setExportPhase] = useState<ExportPhase>('idle');
  const [preparedUris, setPreparedUris] = useState<string[]>([]);
  const [exportTempPaths, setExportTempPaths] = useState<string[]>([]);

  const handleExportImages = useCallback(async () => {
    const originalUris = new Set<string>();
    for (const s of strikes) {
      originalUris.add(s.currentImageUri);
      if (s.previousImageUri) originalUris.add(s.previousImageUri);
    }
    if (originalUris.size === 0) return;

    setExporting(true);
    let tempPaths: string[] = [];
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to save images.');
        return;
      }

      const { uris: markedUris, tempPaths: markedTemp } = await markFaceUrisWithLabels(allFaceUris, strikes);
      tempPaths = markedTemp;
      const uriToMarked = new Map<string, string>();
      allFaceUris.forEach((orig, i) => uriToMarked.set(orig, markedUris[i]));

      let saved = 0;
      for (const orig of originalUris) {
        const toSave = uriToMarked.get(orig) ?? orig;
        try {
          await MediaLibrary.saveToLibraryAsync(toSave);
          saved++;
        } catch (err) {
          console.warn('[GameOver] Failed to save:', toSave, err);
        }
      }
      Alert.alert('Export Complete', `Saved ${saved} image${saved !== 1 ? 's' : ''} to your photo library.`);
    } catch (err) {
      console.error('[GameOver] Export error:', err);
      Alert.alert('Export Failed', 'Could not save images to photo library.');
    } finally {
      await cleanupTempMarkedPaths(tempPaths);
      setExporting(false);
    }
  }, [strikes, allFaceUris]);

  const handleExportVideo = useCallback(async () => {
    if (allFaceUris.length === 0) return;
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to save the video.');
      return;
    }
    setExportPhase('preparing');
    try {
      const { uris, tempPaths } = await markFaceUrisWithLabels(allFaceUris, strikes);
      console.log('[GameOver] Overlay pass done, prepared', uris.length, 'frames');
      setPreparedUris(uris);
      setExportTempPaths(tempPaths);
      setExportPhase('preview');
    } catch (err) {
      console.error('[GameOver] Overlay pass error:', err);
      Alert.alert('Export Failed', 'Could not prepare images for export.');
      setExportPhase('idle');
    }
  }, [allFaceUris, strikes]);

  const handleCancelExport = useCallback(() => {
    cleanupTempMarkedPaths(exportTempPaths);
    setExportPhase('idle');
    setPreparedUris([]);
    setExportTempPaths([]);
  }, [exportTempPaths]);

  const handleCreateVideo = useCallback(async () => {
    if (preparedUris.length === 0) return;
    setExportPhase('creating');
    try {
      const videoUri = await imagesToVideo(
        preparedUris,
        undefined,
        undefined,
        require('../../assets/vaporwave.mp3')
      );
      await MediaLibrary.saveToLibraryAsync(videoUri);
      Alert.alert('Export Complete', 'Video saved to your photo library.');
    } catch (err) {
      console.error('[GameOver] Video export error:', err);
      Alert.alert('Video Export Failed', 'Could not create or save the video.');
    } finally {
      await cleanupTempMarkedPaths(exportTempPaths);
      setExportPhase('idle');
      setPreparedUris([]);
      setExportTempPaths([]);
    }
  }, [preparedUris, exportTempPaths]);

  const canExportVideo = allFaceUris.length > 0;

  const uriToFrame = Object.fromEntries(allFaceUris.map((uri, i) => [uri, i + 1]));

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
          <ActivityIndicator size="large" color="#e6c44d" />
          <Text style={styles.spinnerLabel}>
            {exportPhase === 'preparing' ? 'Adding overlays...' : 'Creating video...'}
          </Text>
        </View>
      )}
      {exportPhase === 'preview' && preparedUris.length > 0 && (
        <View style={styles.exportPreviewOverlay}>
          <Text style={styles.exportPreviewTitle}>Frames to export ({preparedUris.length})</Text>
          <ScrollView
            horizontal
            style={styles.exportPreviewScroll}
            contentContainerStyle={styles.exportPreviewScrollContent}
            showsHorizontalScrollIndicator
          >
            {preparedUris.map((uri, i) => (
              <View key={i} style={styles.exportPreviewFrame}>
                <Image source={{ uri }} style={styles.exportPreviewImage} resizeMode="cover" />
                <View style={styles.exportPreviewBadge}>
                  <Text style={styles.frameBadgeText}>{i + 1}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.exportPreviewButtons}>
            <TouchableOpacity style={[styles.button, styles.exportButton]} onPress={handleCreateVideo} activeOpacity={0.8}>
              <Text style={styles.buttonText}>CREATE VIDEO</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelExport}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={[styles.title, styles.titleShadow]}>GAME OVER</Text>
        <Text style={styles.title}>GAME OVER</Text>
      </View>
      <View style={styles.scoreContainer}>
        <Text style={[styles.scoreText, styles.scoreTextShadow]}>SCORE: {totalFaces} UNIQUE {totalFaces === 1 ? 'FACE' : 'FACES'}</Text>
        <Text style={styles.scoreText}>SCORE: {totalFaces} UNIQUE {totalFaces === 1 ? 'FACE' : 'FACES'}</Text>
      </View>

      <View style={styles.strikesList}>
        {strikes.map((strike, i) => (
          <View key={i} style={styles.strikeCard}>
            <View style={styles.strikeCardRow}>
              <View style={styles.strikeTypeContainer}>
                <Text style={[styles.strikeType, styles.strikeTypeRotated]} numberOfLines={1}>
                  {strike.type === 'similar' ? 'SAME' : strike.type.toUpperCase()}
                </Text>
              </View>
              <View style={styles.strikeContent}>
                {(strike.type === 'similar' || strike.type === 'tilt' || strike.type === 'zoom') && strike.previousImageUri ? (
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

      <TouchableOpacity style={styles.button} onPress={onPlayAgain} activeOpacity={0.8}>
        <Text style={[styles.buttonText, styles.playAgainButtonText]}>PLAY AGAIN</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.exportButton, (exportPhase !== 'idle' || exporting) && styles.buttonDisabled]}
        onPress={handleExportVideo}
        onLongPress={handleExportImages}
        disabled={exportPhase !== 'idle' || exporting}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {exportPhase === 'preparing' ? 'Adding overlays...' : exportPhase === 'creating' ? 'Creating video...' : exporting ? 'Exporting...' : 'EXPORT VIDEO'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
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
  scroll: { flex: 1, backgroundColor: 'transparent' },
  container: { alignItems: 'center', padding: 24, paddingBottom: 48 },
  previewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  previewImageWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewFrameBadge: {
    position: 'absolute',
    top: 48,
    left: 24,
    backgroundColor: 'rgba(107, 90, 50, 0.9)',
    borderRadius: 12,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  previewLabel: {
    position: 'absolute',
    bottom: 48,
    color: '#e6c44d',
    fontSize: 18,
    fontWeight: '600',
  },
  spinnerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  spinnerLabel: {
    color: '#e6c44d',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  exportPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    padding: 24,
    zIndex: 10,
  },
  exportPreviewTitle: {
    color: '#e6c44d',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  exportPreviewScroll: { flex: 1 },
  exportPreviewScrollContent: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
  },
  exportPreviewFrame: {
    width: 120,
    height: 160,
    position: 'relative',
  },
  exportPreviewImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  exportPreviewBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(107, 90, 50, 0.9)',
    borderRadius: 8,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  exportPreviewButtons: {
    marginTop: 24,
    gap: 12,
  },
  cancelButton: {
    marginTop: 12,
    alignSelf: 'center',
  },
  cancelButtonText: {
    color: '#e6c44d',
    fontSize: 16,
    fontWeight: '600',
  },
  titleContainer: {
    position: 'relative',
    marginTop: 25,
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
  scoreContainer: {
    position: 'relative',
    marginTop: 4,
    marginBottom: 24,
  },
  scoreText: {
    fontSize: 20,
    color: '#e6c44d',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  scoreTextShadow: {
    position: 'absolute',
    top: 1,
    left: 1,
    color: 'rgba(0,0,0,0.5)',
  },
  strikesList: { width: '100%', marginBottom: 16 },
  strikeCard: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingRight: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderLeftColor: '#e6c44d',
    borderRightColor: '#e6c44d',
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
