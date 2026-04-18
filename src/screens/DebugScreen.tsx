import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { ProcessResult } from '../services/FaceComparisonService';
import { blendshapeDistance, type BlendshapeResult } from '../services/BlendshapeService';

export type PreviousFaceDebug = {
  imageUri: string;
  blendshapes: number[];
  pose?: { pitchDeg: number; rollDeg: number; yawDeg: number };
  round: number;
};

interface DebugScreenProps {
  rawImageUri: string;
  currentBlendshapes?: BlendshapeResult;
  previousFaces: PreviousFaceDebug[];
  scores?: ProcessResult['scores'];
  onContinue: () => void;
  onDumpLog?: () => void;
}

function fmtDist(val: number): string {
  return val.toFixed(3);
}

// Shared grid component for both cosine similarity and blendshape distance. Exported for use in StrikeScreen.
export function DataGrid({ vectors, labels, title, imageUris }: {
  vectors: number[][];
  labels: string[];
  title: string;
  imageUris?: string[];
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
                  const uri = imageUris?.[i];
                  return (
                    <View key={`c-${i}-${j}`} style={[styles.gridCell, { width: CELL, height: CELL }]}>
                      {uri ? (
                        <Image source={{ uri }} style={{ width: CELL - 4, height: CELL - 4, borderRadius: 4 }} resizeMode="cover" />
                      ) : (
                        <Text style={styles.gridValue}>—</Text>
                      )}
                    </View>
                  );
                }

                const dist = blendshapeDistance(rowVec, colVec);
                const display = fmtDist(dist);
                const bg = dist < 0.3 ? '#4a1a1a' : dist < 0.6 ? '#3a2a1a' : '#1a2a1a';

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

function fmtPose(p: { pitchDeg: number; rollDeg: number; yawDeg: number }): string {
  return `p ${p.pitchDeg.toFixed(1)}° • r ${p.rollDeg.toFixed(1)}° • y ${p.yawDeg.toFixed(1)}°`;
}

export function DebugScreen({
  rawImageUri,
  currentBlendshapes,
  previousFaces,
  scores,
  onContinue,
  onDumpLog,
}: DebugScreenProps) {
  const allLabels = [...previousFaces.map((f) => `R${f.round + 1}`), 'Now'];

  const currentBsScores = currentBlendshapes?.scores ?? [];
  const allBlendshapes = [...previousFaces.map((f) => f.blendshapes), currentBsScores];
  const allImageUris = [...previousFaces.map((f) => f.imageUri), rawImageUri];
  const hasBlendshapes = currentBsScores.length > 0;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Debug</Text>

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

      {/* ── Current capture ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current capture</Text>
        <View style={styles.imageBox}>
          <Image source={{ uri: rawImageUri }} style={styles.thumbLarge} resizeMode="cover" />
        </View>
      </View>

      {/* ── Tilt: baseline + recent captures ── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tilt (pitch • roll • yaw)</Text>
        {previousFaces[0]?.pose && (
          <View style={styles.tiltRow}>
            <Text style={styles.tiltLabel}>Baseline</Text>
            <Text style={styles.mono}>{fmtPose(previousFaces[0].pose)}</Text>
          </View>
        )}
        {previousFaces.slice(1).map((f, i) =>
          f.pose ? (
            <View key={`pose-${f.round}-${i}`} style={styles.tiltRow}>
              <Text style={styles.tiltLabel}>R{f.round + 1}</Text>
              <Text style={styles.mono}>{fmtPose(f.pose)}</Text>
            </View>
          ) : null
        )}
        {scores?.pose && (
          <View style={[styles.tiltRow, scores.pose.tiltStrike && styles.poseRowTilt]}>
            <Text style={styles.tiltLabel}>Now</Text>
            <Text style={styles.mono}>{fmtPose(scores.pose)}</Text>
            {scores.pose.tiltStrike && (
              <Text style={styles.tiltWarning}>⚠ exceeds threshold</Text>
            )}
          </View>
        )}
        {!previousFaces[0]?.pose && !scores?.pose && (
          <Text style={styles.monoSmall}>No pose data yet</Text>
        )}
      </View>

      {/* ── Blendshape distance grid ── */}
      {hasBlendshapes && (
        <DataGrid vectors={allBlendshapes} labels={allLabels} title="Blendshape distance (L2)" imageUris={allImageUris} />
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
  mono: { fontSize: 11, color: '#ccc', fontFamily: 'monospace', marginBottom: 4 },
  monoSmall: { fontSize: 10, color: '#999', fontFamily: 'monospace', marginBottom: 2 },
  poseRowTilt: { borderWidth: 1, borderColor: '#b86' },
  tiltRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  tiltLabel: { color: '#8af', fontSize: 12, fontWeight: '600', width: 72 },
  tiltWarning: { color: '#fb8', fontSize: 11, marginLeft: 8, fontWeight: '600' },
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
