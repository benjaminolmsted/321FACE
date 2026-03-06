import { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

export type StrikeDetail = {
  type: 'similar' | 'tilt' | 'zoom';
  currentImageUri: string;
  previousImageUri?: string;
  currentBlendshapes?: number[];
};

type Props = {
  strikes: StrikeDetail[];
  totalFaces: number;
  onPlayAgain: () => void;
};

export function GameOverScreen({ strikes, totalFaces, onPlayAgain }: Props) {
  const [exporting, setExporting] = useState(false);

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

  return (
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
                  <Image source={{ uri: strike.previousImageUri }} style={styles.faceImage} resizeMode="cover" />
                </View>
                <View style={styles.imageSlot}>
                  <Text style={styles.imageLabel}>Striking</Text>
                  <Image source={{ uri: strike.currentImageUri }} style={styles.faceImage} resizeMode="cover" />
                </View>
              </View>
            ) : (
              <Image source={{ uri: strike.currentImageUri }} style={styles.singleImage} resizeMode="cover" />
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

      <TouchableOpacity style={styles.button} onPress={onPlayAgain} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play again!</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#fff' },
  container: { alignItems: 'center', padding: 24, paddingBottom: 48 },
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
  faceImage: { width: 100, height: 100, borderRadius: 8 },
  contentBox: { alignItems: 'center' },
  contentText: { fontSize: 18, fontWeight: 'bold', color: '#c00' },
  contentSubtext: { fontSize: 14, color: '#666', marginBottom: 8 },
  singleImage: { width: 120, height: 120, borderRadius: 8, marginTop: 4 },
  button: { backgroundColor: '#000', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 12, width: '100%', alignItems: 'center', marginBottom: 12 },
  exportButton: { backgroundColor: '#444' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
