import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type PlayMode = 'subtle' | 'balanced' | 'extreme';

type Props = {
  onPlay: (mode: PlayMode) => void;
  onPlayDebug: () => void;
};

export function HomeScreen({ onPlay, onPlayDebug }: Props) {
  const [rulesVisible, setRulesVisible] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>321FACE</Text>
      <Text style={styles.subtitle}>Make a different face each round</Text>
      <TouchableOpacity style={styles.button} onPress={() => onPlay('subtle')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play (subtle)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => onPlay('balanced')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play (balanced)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={() => onPlay('extreme')} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play (extreme)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onPlayDebug} activeOpacity={0.8}>
        <Text style={styles.buttonTextSecondary}>Play (debug)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonRules]} onPress={() => setRulesVisible(true)} activeOpacity={0.8}>
        <Text style={styles.buttonRulesText}>Rules</Text>
      </TouchableOpacity>
      <Modal visible={rulesVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setRulesVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>GAMEPLAY</Text>
              <Text style={styles.modalBody}>
                1) Take a baseline photo. This photo sets the pose for the round. Tilt your head too much from baseline: get a STRIKE! Zoom in or out too much? STRIKE!
                {'\n\n'}
                2) Make a unique FACE. If your face is too similar to a previous face: STRIKE.
              </Text>
              <Text style={[styles.modalTitle, styles.modalSection]}>STRIKE LIMITS</Text>
              <Text style={styles.modalBody}>
                Subtle — 3 strikes{'\n'}
                Balanced — 2 strikes{'\n'}
                Extreme — 1 strike
                {'\n\n'}
                What is considered similar differs in each mode.
              </Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setRulesVisible(false)} activeOpacity={0.8}>
                <Text style={styles.buttonText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 48,
  },
  button: {
    backgroundColor: '#000',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  buttonSecondary: {
    backgroundColor: '#444',
  },
  buttonRules: {
    backgroundColor: 'transparent',
    marginTop: 24,
    borderWidth: 2,
    borderColor: '#666',
  },
  buttonRulesText: {
    color: '#333',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  modalSection: {
    marginTop: 24,
  },
  modalBody: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  modalClose: {
    backgroundColor: '#000',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    alignSelf: 'flex-start',
  },
});
