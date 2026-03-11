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

const PREVIEW_INTERVAL_MS = 550; // Match video's 0.55s per frame

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
      <Text style={styles.title}>Game Over</Text>
      <Text style={styles.subtitle}>{totalFaces} unique faces in this run</Text>

      <View style={styles.strikesList}>
        {strikes.map((strike, i) => (
          <View key={i} style={styles.strikeCard}>
            <Text style={styles.strikeLabel}>Strike {i + 1}: {strike.type.toUpperCase()}</Text>
            {strike.type === 'tilt' && <Text style={styles.contentSubtext}>Face too tilted</Text>}
            {strike.type === 'zoom' && <Text style={styles.contentSubtext}>Face too close or far</Text>}
            {(strike.type === 'similar' || strike.type === 'tilt' || strike.type === 'zoom') && strike.previousImageUri ? (
              <View style={styles.similarRow}>
                <View style={styles.imageSlot}>
                  <Text style={styles.imageLabel}>
                    {strike.type === 'similar' ? 'Previous' : 'Baseline'}
                  </Text>
                  <ImageWithBadge uri={strike.previousImageUri} />
                </View>
                <View style={styles.imageSlot}>
                  <Text style={styles.imageLabel}>Striking</Text>
                  <ImageWithBadge uri={strike.currentImageUri} />
                </View>
              </View>
            ) : (
              <ImageWithBadge uri={strike.currentImageUri} style={styles.singleImage} />
            )}
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.button, styles.exportButton]}
        onPress={handleExportImages}
        disabled={exporting}
      >
        <Text style={styles.buttonText}>{exporting ? 'Exporting...' : 'Export images'}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, styles.exportButton, !canExportVideo && styles.buttonDisabled]}
        onPress={handleExportVideo}
        disabled={!canExportVideo || exportingVideo}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonText}>{exportingVideo ? 'Exporting video...' : 'Export video'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button} onPress={onPlayAgain} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play again!</Text>
      </TouchableOpacity>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
  scroll: { flex: 1, backgroundColor: '#fff' },
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
    backgroundColor: 'rgba(0,0,0,0.7)',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  title: { fontSize: 36, fontWeight: 'bold', color: '#c00', marginBottom: 4 },
  subtitle: { fontSize: 20, color: '#666', marginBottom: 24 },
  strikesList: { width: '100%', marginBottom: 32 },
  strikeCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#c00',
  },
  strikeLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 12 },
  similarRow: { flexDirection: 'row', gap: 16, justifyContent: 'center' },
  imageSlot: { alignItems: 'center' },
  imageLabel: { fontSize: 12, color: '#666', marginBottom: 4 },
  imageWithBadge: { position: 'relative' },
  faceImage: { width: 100, height: 100, borderRadius: 8 },
  frameBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
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
  contentSubtext: { fontSize: 14, color: '#666', marginBottom: 8 },
  singleImage: { width: 120, height: 120, borderRadius: 8, marginTop: 4 },
  button: { backgroundColor: '#000', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  exportButton: { backgroundColor: '#444' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
