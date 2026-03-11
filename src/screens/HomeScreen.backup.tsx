import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FlowPhase } from '../context/FlowContext';
import { buildGameParams } from '../context/FlowContext';

export type PlayMode = 'subtle' | 'balanced' | 'extreme';

export type GameStyle = '321face' | 'snap';

const COUNTDOWN_MS = 1250;
const SNAP_COUNTDOWN_MS = 75;
const GAME_STYLE_KEY = '@321face_gameStyle';

type Props = {
  advance: (next: FlowPhase) => void;
};

export function HomeScreen({ advance }: Props) {
  const [rulesVisible, setRulesVisible] = useState(false);
  const [gameStyle, setGameStyle] = useState<GameStyle>('321face');

  useEffect(() => {
    AsyncStorage.getItem(GAME_STYLE_KEY).then((v) => {
      if (v === '321face' || v === 'snap') setGameStyle(v);
    });
  }, []);

  const setGameStyleAndPersist = (s: GameStyle) => {
    setGameStyle(s);
    AsyncStorage.setItem(GAME_STYLE_KEY, s);
  };

  const countdownMs = gameStyle === 'snap' ? SNAP_COUNTDOWN_MS : COUNTDOWN_MS;

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/MASKS_ON_MARBLE.png')}
        style={styles.heroImage}
        resizeMode="cover"
      />
      <View style={styles.buttonsOverlay}>
      <TouchableOpacity
        style={[styles.button, styles.buttonRules]}
        onPress={() => setRulesVisible(true)}
        onLongPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('balanced', COUNTDOWN_MS, true) })}
        activeOpacity={0.8}
      >
        <Text style={styles.buttonRulesText}>Rules</Text>
      </TouchableOpacity>
      <View style={styles.playAndCountdownContainer}>
      <View style={[styles.selectorRow, styles.playModeRow]}>
        <TouchableOpacity
          style={[styles.selectorBtn, styles.playModeBtn]}
          onPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('balanced', countdownMs, false) })}
          onLongPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('subtle', countdownMs, false) })}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, styles.playModeBtnText]}>BALANCED</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, styles.playModeBtn]}
          onPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('extreme', countdownMs, false) })}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, styles.playModeBtnText]}>EXTREME</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.selectorRow, styles.modeSelectorRow]}>
        <TouchableOpacity
          style={[styles.selectorBtn, styles.selectorBtnLeft, gameStyle === '321face' && styles.selectorBtnActive]}
          onPress={() => setGameStyleAndPersist('321face')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, gameStyle === '321face' && styles.selectorTextActive]}>Countdown</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectorBtn, styles.selectorBtnRight, gameStyle === 'snap' && styles.selectorBtnActive]}
          onPress={() => setGameStyleAndPersist('snap')}
          activeOpacity={0.8}
        >
          <Text style={[styles.selectorText, gameStyle === 'snap' && styles.selectorTextActive]}>Snap</Text>
        </TouchableOpacity>
      </View>
      </View>
      </View>
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
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  buttonsOverlay: {
    flex: 1,
    alignItems: 'center',
  },
  playAndCountdownContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  selectorBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#666',
    backgroundColor: '#333',
  },
  selectorBtnActive: {
    borderColor: '#666',
    backgroundColor: '#d4af37',
  },
  selectorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  selectorTextActive: {
    color: '#333',
  },
  modeSelectorRow: {
    marginTop: -21,
    marginBottom: 16,
    gap: 0,
  },
  selectorBtnLeft: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 0,
    marginRight: -1,
  },
  selectorBtnRight: {
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeftWidth: 0,
    marginLeft: -1,
  },
  playModeRow: {
    marginTop: 375,
    marginBottom: 32,
  },
  playModeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 16,
    minWidth: 120,
    backgroundColor: '#000',
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playModeBtnText: {
    color: '#d4af37',
    fontSize: 21,
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
    position: 'absolute',
    top: 173,
    backgroundColor: '#fff',
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
