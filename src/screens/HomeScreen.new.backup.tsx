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
const GOLD = '#d4af37';
const GOLD_DARK = '#b8960f';

type Props = {
  advance: (next: FlowPhase) => void;
};

export function HomeScreen({ advance }: Props) {
  const [rulesVisible, setRulesVisible] = useState(false);
  const [gameStyle, setGameStyle] = useState<GameStyle>('321face');
  const [playMode, setPlayMode] = useState<PlayMode>('balanced');

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

  const onPlay = () => {
    advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams(playMode, countdownMs, false) });
  };

  return (
    <View style={styles.container}>
      <Image
        source={require('../../assets/MASKS_ON_MARBLE.png')}
        style={styles.backgroundImage}
        resizeMode="cover"
      />
      <View style={styles.content}>
        <TouchableOpacity
          style={styles.rulesButton}
          onPress={() => setRulesVisible(true)}
          onLongPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('balanced', COUNTDOWN_MS, true) })}
        >
          <Text style={styles.rulesButtonText}>?</Text>
        </TouchableOpacity>

        <View style={styles.titleArea}>
          <Text style={styles.titleSmall}>3... 2... 1</Text>
          <Text style={styles.titleFace}>FACE</Text>
        </View>

        <View style={styles.maskGraphicContainer}>
          <Image
            source={require('../../assets/MASKS_ON_MARBLE.png')}
            style={styles.maskGraphic}
            resizeMode="contain"
          />
        </View>

        <View style={styles.buttonsSection}>
          <View style={[styles.segmentedRow, styles.segmentedGold]}>
            <TouchableOpacity
              style={[styles.segmentedBtn, styles.segmentedBtnLeft, playMode === 'balanced' && styles.segmentedBtnActive]}
              onPress={() => setPlayMode('balanced')}
              onLongPress={() => setPlayMode('subtle')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentedText, playMode === 'balanced' && styles.segmentedTextActive]}>BALANCED</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentedBtn, styles.segmentedBtnRight, playMode === 'extreme' && styles.segmentedBtnActive]}
              onPress={() => setPlayMode('extreme')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentedText, playMode === 'extreme' && styles.segmentedTextActive]}>EXTREME</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.segmentedRow, styles.segmentedGold]}>
            <TouchableOpacity
              style={[styles.segmentedBtn, styles.segmentedBtnLeft, gameStyle === '321face' && styles.segmentedBtnActive]}
              onPress={() => setGameStyleAndPersist('321face')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentedText, gameStyle === '321face' && styles.segmentedTextActive]}>Countdown</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentedBtn, styles.segmentedBtnRight, gameStyle === 'snap' && styles.segmentedBtnActive]}
              onPress={() => setGameStyleAndPersist('snap')}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentedText, gameStyle === 'snap' && styles.segmentedTextActive]}>Snap</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.playButton} onPress={onPlay} activeOpacity={0.8}>
            <Text style={styles.playButtonText}>PLAY</Text>
          </TouchableOpacity>
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
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  backgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    paddingTop: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  rulesButton: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: GOLD,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  rulesButtonText: {
    color: GOLD_DARK,
    fontSize: 24,
    fontWeight: 'bold',
  },
  titleArea: {
    alignItems: 'center',
    marginBottom: 16,
  },
  titleSmall: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '600',
    letterSpacing: 2,
  },
  titleFace: {
    color: GOLD,
    fontSize: 48,
    fontWeight: 'bold',
    letterSpacing: 4,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  maskGraphicContainer: {
    width: 220,
    height: 140,
    marginBottom: 32,
  },
  maskGraphic: {
    width: '100%',
    height: '100%',
  },
  buttonsSection: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  segmentedRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentedGold: {
    borderWidth: 2,
    borderColor: GOLD,
  },
  segmentedBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
  },
  segmentedBtnLeft: {
    borderRightWidth: 1,
    borderRightColor: GOLD,
  },
  segmentedBtnRight: {
    borderLeftWidth: 0,
  },
  segmentedBtnActive: {
    backgroundColor: GOLD,
  },
  segmentedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  segmentedTextActive: {
    color: '#1a1a1a',
  },
  playButton: {
    width: '100%',
    paddingVertical: 20,
    marginTop: 8,
    backgroundColor: GOLD,
    borderWidth: 2,
    borderColor: GOLD_DARK,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalScroll: { flex: 1 },
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
  modalSection: { marginTop: 24 },
  modalBody: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
  },
  modalClose: {
    backgroundColor: GOLD,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 24,
    alignSelf: 'flex-start',
  },
  modalCloseText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
