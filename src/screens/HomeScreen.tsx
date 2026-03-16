import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FlowPhase } from '../context/FlowContext';
import { buildGameParams } from '../context/FlowContext';

export type PlayMode = 'subtle' | 'balanced' | 'extreme';

export type GameStyle = '321face' | 'snap';

const COUNTDOWN_MS = 1250;
const GAME_STYLE_KEY = '@321face_gameStyle';

type Props = {
  advance: (next: FlowPhase) => void;
};

const BALANCED_EXTREME_ASPECT = 1387 / 244;
// Tweak scale (0.7–1) if outline extends past visible image content
const BALANCED_EXTREME_SCALE = 0.82;
const BALANCED_EXTREME_WIDTH = Dimensions.get('window').width * 0.85 * BALANCED_EXTREME_SCALE;

const COUNTDOWN_SNAP_ASPECT = 1387 / 244;
const COUNTDOWN_SNAP_WIDTH = Dimensions.get('window').width * 0.85 * BALANCED_EXTREME_SCALE;

const PLAY_BUTTON_ASPECT = 1122 / 297;
const PLAY_BUTTON_WIDTH = Dimensions.get('window').width * 0.85 * BALANCED_EXTREME_SCALE;

export function HomeScreen({ advance }: Props) {
  const [rulesVisible, setRulesVisible] = useState(false);
  const [gameStyle, setGameStyle] = useState<GameStyle>('321face');
  const [playMode, setPlayMode] = useState<PlayMode>('balanced');
  const [playPressed, setPlayPressed] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GAME_STYLE_KEY).then((v) => {
      if (v === '321face' || v === 'snap') setGameStyle(v);
    });
  }, []);

  const setGameStyleAndPersist = (s: GameStyle) => {
    setGameStyle(s);
    AsyncStorage.setItem(GAME_STYLE_KEY, s);
  };

  const onPlay = () => {
    advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams(playMode, COUNTDOWN_MS, false, gameStyle) });
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
          onLongPress={() => advance({ screen: 'baseline', phase: 'capture', gameParams: buildGameParams('balanced', COUNTDOWN_MS, true, gameStyle) })}
        >
          <Text style={styles.rulesButtonText}>?</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <View style={styles.faceTextContainer}>
            <Text style={[styles.faceText, styles.faceTextShadow]}>321FACE</Text>
            <Text style={styles.faceText}>321FACE</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <Pressable
            onPress={onPlay}
            onPressIn={() => setPlayPressed(true)}
            onPressOut={() => setPlayPressed(false)}
            style={[styles.playButtonWrapper, { width: PLAY_BUTTON_WIDTH, height: PLAY_BUTTON_WIDTH / PLAY_BUTTON_ASPECT }]}
          >
            <View style={styles.playButtonOutline}>
              <Image
                source={require('../../assets/PLAY_ready.png')}
                style={[styles.playButtonImage, { opacity: !playPressed ? 1 : 0 }]}
                resizeMode="cover"
              />
              <Image
                source={require('../../assets/PLAY_pressed.png')}
                style={[styles.playButtonImage, styles.playButtonImageOverlay, { opacity: playPressed ? 1 : 0 }]}
                resizeMode="cover"
              />
            </View>
          </Pressable>

          <View style={[styles.balancedExtremeWrapper, { width: BALANCED_EXTREME_WIDTH, height: BALANCED_EXTREME_WIDTH / BALANCED_EXTREME_ASPECT }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setPlayMode(playMode === 'extreme' ? 'balanced' : 'extreme')}
              onLongPress={() => setPlayMode('subtle')}
              style={styles.balancedExtremeTouchable}
            >
              <View style={styles.balancedExtremeOutline}>
                <Image
                  source={require('../../assets/BALANCED_extreme.png')}
                  style={[styles.balancedExtremeImage, { opacity: playMode !== 'extreme' ? 1 : 0 }]}
                  resizeMode="cover"
                />
                <Image
                  source={require('../../assets/balanced_EXTREME_.png')}
                  style={[styles.balancedExtremeImage, styles.balancedExtremeImageOverlay, { opacity: playMode === 'extreme' ? 1 : 0 }]}
                  resizeMode="cover"
                />
              </View>
            </TouchableOpacity>
          </View>

          <View style={[styles.balancedExtremeWrapper, { width: COUNTDOWN_SNAP_WIDTH, height: COUNTDOWN_SNAP_WIDTH / COUNTDOWN_SNAP_ASPECT }]}>
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setGameStyleAndPersist(gameStyle === 'snap' ? '321face' : 'snap')}
              style={styles.balancedExtremeTouchable}
            >
              <View style={styles.balancedExtremeOutline}>
                <Image
                  source={require('../../assets/COUNTDOWN_snap_.png')}
                  style={[styles.balancedExtremeImage, { opacity: gameStyle !== 'snap' ? 1 : 0 }]}
                  resizeMode="cover"
                />
                <Image
                  source={require('../../assets/countdown_SNAP.png')}
                  style={[styles.balancedExtremeImage, styles.balancedExtremeImageOverlay, { opacity: gameStyle === 'snap' ? 1 : 0 }]}
                  resizeMode="cover"
                />
              </View>
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
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 40,
    paddingTop: 48,
  },
  rulesButton: {
    position: 'absolute',
    top: 32,
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#8b7345',
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  rulesButtonText: {
    color: '#6b5a32',
    fontSize: 24,
    fontWeight: 'bold',
  },
  header: {
    alignItems: 'center',
  },
  countdownText: {
    fontSize: 32,
    color: '#a68a56',
    fontWeight: '300',
    letterSpacing: 4,
  },
  faceTextContainer: {
    position: 'relative',
    marginTop: 30,
  },
  faceText: {
    fontSize: 72,
    color: '#e6c44d',
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  faceTextShadow: {
    position: 'absolute',
    top: 3,
    left: 3,
    color: 'rgba(0,0,0,0.5)',
  },
  controls: {
    width: '85%',
    gap: 20,
  },
  balancedExtremeWrapper: {
    alignSelf: 'center',
    overflow: 'hidden',
    transform: [{ translateY: -20 }],
  },
  balancedExtremeTouchable: {
    flex: 1,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  toggleOuter: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#444',
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
  },
  balancedExtremeOutline: {
    flex: 1,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: 'rgba(230, 196, 77, 0)',
    overflow: 'hidden',
  },
  balancedExtremeImage: {
    width: '100%',
    height: '100%',
  },
  balancedExtremeImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  toggleHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1,
  },
  playButtonWrapper: {
    alignSelf: 'center',
    overflow: 'hidden',
    marginTop: 10,
    transform: [{ translateY: -20 }],
  },
  playButtonOutline: {
    flex: 1,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: 'rgba(230, 196, 77, 0)',
    overflow: 'hidden',
  },
  playButtonImage: {
    width: '100%',
    height: '100%',
  },
  playButtonImageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
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
    backgroundColor: '#8e7334',
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
