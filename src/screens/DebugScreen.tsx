import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProcessResult } from '../services/FaceComparisonService';
import { hashPreview } from '../utils/hashUtils';
import { blendshapeDistance, BLENDSHAPE_NAMES, type BlendshapeResult } from '../services/BlendshapeService';

export type PreviousFaceDebug = {
  imageUri: string;
  inputHash: string;
  embedding: number[];
  blendshapes: number[];
  round: number;
};

interface DebugScreenProps {
  rawImageUri: string;
  faceNetInputUri: string;
  inputHash: string;
  currentEmbedding: number[];
  currentBlendshapes?: BlendshapeResult;
  previousFaces: PreviousFaceDebug[];
  scores?: ProcessResult['scores'];
  onContinue: () => void;
  onDumpLog?: () => void;
}

function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

function fmtSim(val: number): string {
  return (val * 100).toFixed(1);
}

function fmtDist(val: number): string {
  return val.toFixed(3);
}

function fmtHash(hash: string): string {
  if (!hash) return '—';
  return hashPreview(hash, 10);
}

// Shared grid component for both cosine similarity and blendshape distance
function DataGrid({ vectors, labels, title, mode }: {
  vectors: number[][];
  labels: string[];
  title: string;
  mode: 'cosine' | 'euclidean';
}) {
  const n = vectors.length;
  if (n < 2) return null;

  const CELL = 52;
  const LABEL_W = 36;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: LABEL_W }} />
            {labels.map((l) => (
              <View key={`h-${l}`} style={[styles.gridCell, { width: CELL }]}>
                <Text style={styles.gridHeader}>{l}</Text>
              </View>
            ))}
          </View>
          {vectors.map((rowVec, i) => (
            <View key={`r-${i}`} style={{ flexDirection: 'row' }}>
              <View style={[styles.gridRowLabel, { width: LABEL_W }]}>
                <Text style={styles.gridHeader}>{labels[i]}</Text>
              </View>
              {vectors.map((colVec, j) => {
                if (i === j) {
                  return (
                    <View key={`c-${i}-${j}`} style={[styles.gridCell, { width: CELL, backgroundColor: '#333' }]}>
                      <Text style={styles.gridValue}>—</Text>
                    </View>
                  );
                }

                let display: string;
                let bg: string;

                if (mode === 'cosine') {
                  const sim = cosine(rowVec, colVec);
                  const pct = sim * 100;
                  display = fmtSim(sim);
                  bg = pct >= 98 ? '#4a1a1a' : pct >= 95 ? '#3a2a1a' : '#1a2a1a';
                } else {
                  const dist = blendshapeDistance(rowVec, colVec);
                  display = fmtDist(dist);
                  bg = dist < 0.3 ? '#4a1a1a' : dist < 0.6 ? '#3a2a1a' : '#1a2a1a';
                }

                return (
                  <View key={`c-${i}-${j}`} style={[styles.gridCell, { width: CELL, backgroundColor: bg }]}>
                    <Text style={styles.gridValue}>{display}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// Top blendshape values for quick readability
function BlendshapeSummary({ result }: { result: BlendshapeResult }) {
  const entries = BLENDSHAPE_NAMES
    .map((name, i) => ({ name, score: result.scores[i] }))
    .filter((e) => e.name !== '_neutral')
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return (
    <View style={styles.bsSummary}>
      {entries.map((e) => (
        <View key={e.name} style={styles.bsRow}>
          <Text style={styles.bsName}>{e.name}</Text>
          <View style={styles.bsBarOuter}>
            <View style={[styles.bsBarInner, { width: `${Math.min(100, e.score * 100)}%` }]} />
          </View>
          <Text style={styles.bsVal}>{(e.score * 100).toFixed(0)}%</Text>
        </View>
      ))}
      <Text style={styles.monoSmall}>{result.timingMs.toFixed(0)}ms</Text>
    </View>
  );
}

export function DebugScreen({
  rawImageUri,
  faceNetInputUri,
  inputHash,
  currentEmbedding,
  currentBlendshapes,
  previousFaces,
  scores,
  onContinue,
  onDumpLog,
}: DebugScreenProps) {
  const allEmbeddings = [...previousFaces.map((f) => f.embedding), currentEmbedding];
  const allLabels = [...previousFaces.map((f) => `R${f.round + 1}`), 'Now'];

  const currentBsScores = currentBlendshapes?.scores ?? [];
  const allBlendshapes = [...previousFaces.map((f) => f.blendshapes), currentBsScores];
  const hasBlendshapes = currentBsScores.length > 0;

  const simToCurrent = previousFaces.map((f) =>
    currentEmbedding.length > 0 && f.embedding.length > 0
      ? cosine(f.embedding, currentEmbedding)
      : null
  );

  const distToCurrent = previousFaces.map((f) =>
    hasBlendshapes && f.blendshapes.length > 0
      ? blendshapeDistance(f.blendshapes, currentBsScores)
      : null
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Debug</Text>

      {/* ── Current capture ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current capture</Text>
        <View style={styles.imagesRow}>
          <View style={styles.imageBox}>
            <Text style={styles.imageLabel}>Raw</Text>
            <Image source={{ uri: rawImageUri }} style={styles.thumbLarge} resizeMode="cover" />
          </View>
          <View style={styles.imageBox}>
            <Text style={styles.imageLabel}>FaceNet 160x160</Text>
            <Image source={{ uri: faceNetInputUri }} style={styles.thumbLarge} resizeMode="cover" />
          </View>
        </View>
        <Text style={styles.mono}>input hash: {fmtHash(inputHash)}</Text>
      </View>

      {/* ── Blendshape summary ── */}
      {currentBlendshapes && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blendshapes (top 8)</Text>
          <BlendshapeSummary result={currentBlendshapes} />
        </View>
      )}

      {/* ── Previous faces with similarity + distance to current ── */}
      {previousFaces.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Previous faces ({previousFaces.length})</Text>
          {previousFaces.map((f, i) => (
            <View key={`${f.round}-${i}`} style={styles.prevCard}>
              <Image source={{ uri: f.imageUri }} style={styles.thumbSmall} resizeMode="cover" />
              <View style={styles.prevMeta}>
                <Text style={styles.prevRound}>Round {f.round + 1}</Text>
                <Text style={styles.monoSmall}>hash: {fmtHash(f.inputHash)}</Text>
              </View>
              <View style={styles.badgeColumn}>
                {simToCurrent[i] != null && (
                  <View style={styles.simBadge}>
                    <Text style={styles.simBadgeText}>{fmtSim(simToCurrent[i]!)}%</Text>
                  </View>
                )}
                {distToCurrent[i] != null && (
                  <View style={styles.distBadge}>
                    <Text style={styles.distBadgeText}>d={fmtDist(distToCurrent[i]!)}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Embedding cosine similarity grid ── */}
      <DataGrid vectors={allEmbeddings} labels={allLabels} title="Embedding cosine similarity" mode="cosine" />

      {/* ── Blendshape distance grid ── */}
      {hasBlendshapes && (
        <DataGrid vectors={allBlendshapes} labels={allLabels} title="Blendshape distance (L2)" mode="euclidean" />
      )}

      <View style={styles.buttonRow}>
        {onDumpLog && (
          <TouchableOpacity style={styles.dumpButton} onPress={onDumpLog} activeOpacity={0.8}>
            <Text style={styles.dumpButtonText}>Dump Log</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.button} onPress={onContinue} activeOpacity={0.8}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#1a1a1a' },
  container: { alignItems: 'stretch', padding: 20, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#fff', textAlign: 'center', marginBottom: 16 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: '#fff', marginBottom: 10 },
  imagesRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  imageBox: { alignItems: 'center' },
  imageLabel: { fontSize: 11, color: '#888', marginBottom: 4 },
  thumbLarge: { width: 120, height: 120, borderRadius: 8, borderWidth: 1, borderColor: '#333' },
  thumbSmall: { width: 56, height: 56, borderRadius: 6, marginRight: 10 },
  mono: { fontSize: 11, color: '#ccc', fontFamily: 'monospace', marginBottom: 4 },
  monoSmall: { fontSize: 10, color: '#999', fontFamily: 'monospace', marginBottom: 2 },
  prevCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#2a2a2a', borderRadius: 8, padding: 10, marginBottom: 6,
  },
  prevMeta: { flex: 1 },
  prevRound: { fontSize: 12, fontWeight: '600', color: '#aaa', marginBottom: 4 },
  badgeColumn: { alignItems: 'flex-end', gap: 4, marginLeft: 8 },
  simBadge: {
    backgroundColor: '#3a3a5a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  simBadgeText: { color: '#8af', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  distBadge: {
    backgroundColor: '#3a4a3a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  distBadgeText: { color: '#8fa', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },
  bsSummary: { backgroundColor: '#2a2a2a', borderRadius: 8, padding: 10 },
  bsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  bsName: { color: '#aaa', fontSize: 10, fontFamily: 'monospace', width: 120 },
  bsBarOuter: { flex: 1, height: 8, backgroundColor: '#333', borderRadius: 4, marginHorizontal: 6 },
  bsBarInner: { height: 8, backgroundColor: '#6c8', borderRadius: 4 },
  bsVal: { color: '#ccc', fontSize: 10, fontFamily: 'monospace', width: 32, textAlign: 'right' },
  gridCell: {
    height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#444',
  },
  gridRowLabel: { height: 32, alignItems: 'center', justifyContent: 'center' },
  gridHeader: { color: '#888', fontSize: 11, fontWeight: '600' },
  gridValue: { color: '#ccc', fontSize: 11, fontFamily: 'monospace' },
  buttonRow: { flexDirection: 'row', gap: 12, justifyContent: 'center' },
  dumpButton: {
    backgroundColor: '#555', paddingHorizontal: 24, paddingVertical: 16,
    borderRadius: 12,
  },
  dumpButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  button: {
    backgroundColor: '#4a90d9', paddingHorizontal: 48, paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
