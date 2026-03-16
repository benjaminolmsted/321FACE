import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
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

const PREVIEW_INTERVAL_MS = 125; // Match video's 0.125s per frame

export function GameOverScreen({ strikes, totalFaces, allFaceUris, onPlayAgain }: Props) {
  const [exporting, setExporting] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  // Cycle through images while video renders (0.55s per frame to match output)
  useEffect(() => {
    if (!exportingVideo || allFaceUris.length === 0) return;
    setPreviewIndex(0);
    const id = setInterval(() => {
      setPreviewIndex((i) => (i + 1) % allFaceUris.length);
    }, PREVIEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [exportingVideo, allFaceUris.length]);

  const handleExportImages = useCallback(async () => {
    const uris = new Set<string>();
    for (const s of strikes) {
      uris.add(s.currentImageUri);
      if (s.previousImageUri) uris.add(s.previousImageUri);
    }

    setExporting(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to save images.');
        return;
      }

      let saved = 0;
      for (const uri of uris) {
        try {
          await MediaLibrary.saveToLibraryAsync(uri);
          saved++;
        } catch (err) {
          console.warn('[GameOver] Failed to save:', uri, err);
        }
      }
      Alert.alert('Export Complete', `Saved ${saved} image${saved !== 1 ? 's' : ''} to your photo library.`);
    } catch (err) {
      console.error('[GameOver] Export error:', err);
      Alert.alert('Export Failed', 'Could not save images to photo library.');
    } finally {
      setExporting(false);
    }
  }, [strikes]);

  const handleExportVideo = useCallback(async () => {
    if (allFaceUris.length === 0) return;
    console.log('[GameOver] Export video: start, allFaceUris.length=', allFaceUris.length);
    setExportingVideo(true);
    try {
      console.log('[GameOver] Export video: requesting permission...');
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      console.log('[GameOver] Export video: permission status=', status);
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to save the video.');
        return;
      }
      console.log('[GameOver] Export video: calling imagesToVideo...');
      const videoUri = await imagesToVideo(
        allFaceUris,
        undefined,
        undefined,
        require('../../assets/vaporwave.mp3')
      );
      console.log('[GameOver] Export video: imagesToVideo done, videoUri=', videoUri);
      console.log('[GameOver] Export video: saving to MediaLibrary...');
      await MediaLibrary.saveToLibraryAsync(videoUri);
      console.log('[GameOver] Export video: save complete');
      Alert.alert('Export Complete', 'Video saved to your photo library.');
    } catch (err) {
      console.error('[GameOver] Video export error:', err);
      Alert.alert('Video Export Failed', 'Could not create or save the video.');
    } finally {
      setExportingVideo(false);
      console.log('[GameOver] Export video: done (success or error)');
    }
  }, [allFaceUris]);

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
      {exportingVideo && allFaceUris.length > 0 && (
        <View style={styles.previewOverlay}>
          <View style={styles.previewImageWrapper}>
            <Image
              source={{ uri: allFaceUris[previewIndex] }}
              style={styles.previewImage}
              resizeMode="cover"
            />
            <View style={styles.previewFrameBadge}>
              <Text style={styles.frameBadgeText}>{previewIndex + 1}</Text>
            </View>
          </View>
          <Text style={styles.previewLabel}>Rendering video...</Text>
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
        style={[styles.button, styles.exportButton, (exportingVideo || exporting) && styles.buttonDisabled]}
        onPress={handleExportVideo}
        onLongPress={handleExportImages}
        disabled={exportingVideo || exporting}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>
          {exportingVideo ? 'Exporting video...' : exporting ? 'Exporting...' : 'EXPORT VIDEO'}
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
    fontSize: 36,
    fontWeight: '900',
  },
});
