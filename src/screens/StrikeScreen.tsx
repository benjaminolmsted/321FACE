import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProcessResult } from '../services/FaceComparisonService';
import { DataGrid } from './DebugScreen';

type Props = {
  reason: 'similar' | 'tilt' | 'zoom';
  currentImageUri: string;
  previousImageUri?: string;
  strikes: number;
  maxStrikes: number;
  onContinue: () => void;
  benchmarks?: ProcessResult['benchmarks'];
  scores?: ProcessResult['scores'];
  /** For debug grid: previous faces + current blendshapes. If provided, shows similarity grid. */
  previousFaces?: { imageUri: string; blendshapes?: number[]; round: number }[];
  currentBlendshapes?: number[];
};

export function StrikeScreen({
  reason,
  currentImageUri,
  previousImageUri,
  strikes,
  maxStrikes,
  onContinue,
  benchmarks,
  scores,
  previousFaces,
  currentBlendshapes,
}: Props) {
  const isTilt = reason === 'tilt';
  const isZoom = reason === 'zoom';

  const subtitle =
    isTilt ? 'Face too tilted' : isZoom ? 'Face too close or far' : 'Similar Faces Detected';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{isTilt ? 'TILT!!!' : isZoom ? 'ZOOM!!!' : 'Strike!'}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.strikes}>Strikes: {strikes} / {maxStrikes}</Text>

      {/* Blendshape distance grid: faces on diagonal, similarity scores in cells */}
      {previousFaces && currentBlendshapes && previousFaces.length >= 1 && (
        <DataGrid
          vectors={[...previousFaces.map((f) => f.blendshapes ?? []), currentBlendshapes]}
          labels={[...previousFaces.map((f) => `R${f.round + 1}`), 'Now']}
          title="Blendshape distance (L2)"
          mode="euclidean"
          imageUris={[...previousFaces.map((f) => f.imageUri), currentImageUri]}
        />
      )}

      {(benchmarks || scores) && (
        <View style={styles.debugBox}>
          <Text style={styles.debugTitle}>Benchmarks & Scores</Text>
          {benchmarks && (
            <View style={styles.debugSection}>
              <Text style={styles.debugLabel}>Timing (ms)</Text>
              <Text style={styles.debugText}>ML Kit: {benchmarks.mlKitMs?.toFixed(0) ?? '—'}</Text>
              {benchmarks.faceNetMs && (
                <>
                  <Text style={styles.debugText}>
                    FaceNet align: {benchmarks.faceNetMs.align.toFixed(0)}
                  </Text>
                  <Text style={styles.debugText}>
                    FaceNet model: {benchmarks.faceNetMs.modelRun.toFixed(0)}
                  </Text>
                  <Text style={styles.debugText}>
                    FaceNet total: {benchmarks.faceNetMs.total.toFixed(0)}
                  </Text>
                </>
              )}
              {benchmarks.contourMs !== undefined && (
                <Text style={styles.debugText}>Contour compare: {benchmarks.contourMs.toFixed(0)}</Text>
              )}
              {benchmarks.embeddingMs !== undefined && (
                <Text style={styles.debugText}>Embedding compare: {benchmarks.embeddingMs.toFixed(0)}</Text>
              )}
            </View>
          )}
          {scores && (
            <View style={styles.debugSection}>
              <Text style={styles.debugLabel}>Similarity Scores</Text>
              {scores.contour && (
                <>
                  <Text style={styles.debugText}>
                    Contour overall: {(scores.contour.overall * 100).toFixed(1)}%
                  </Text>
                  {Object.entries(scores.contour.perContour).map(([k, v]) => (
                    <Text key={k} style={styles.debugTextSmall}>
                      {k}: {(v * 100).toFixed(1)}%
                    </Text>
                  ))}
                </>
              )}
              {scores.embedding && (
                <Text style={styles.debugText}>
                  Embedding max: {(scores.embedding.maxSimilarity * 100).toFixed(1)}%
                  {scores.embedding.perFace.length > 1 &&
                    ` (per face: ${scores.embedding.perFace.map((s) => (s * 100).toFixed(0)).join(', ')}%)`}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      <View style={styles.images}>
        {previousImageUri && (
          <View style={styles.imageBox}>
            <Text style={styles.imageLabel}>Previous</Text>
            <Image source={{ uri: previousImageUri }} style={styles.image} resizeMode="cover" />
          </View>
        )}
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>Current</Text>
          <Image source={{ uri: currentImageUri }} style={styles.image} resizeMode="cover" />
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={onContinue} activeOpacity={0.8}>
        <Text style={styles.buttonText}>
          {strikes >= 3 ? 'Game Over - Play Again' : 'Continue'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#c00',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  strikes: {
    fontSize: 16,
    marginBottom: 24,
  },
  images: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  imageBox: {
    alignItems: 'center',
  },
  imageLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#000',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  debugBox: {
    width: '100%',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  debugSection: {
    marginBottom: 8,
  },
  debugLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 12,
    color: '#333',
  },
  debugTextSmall: {
    fontSize: 11,
    color: '#555',
    marginLeft: 8,
  },
});
