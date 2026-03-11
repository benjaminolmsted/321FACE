import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { BackHandler, Image, Text, View } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { BaselineCaptureScreen } from './src/screens/BaselineCaptureScreen';
import { FlowProvider, useFlow } from './src/context/FlowContext';
import { CameraProvider } from './src/context/CameraContext';
import { warmupBlendshapes } from './src/services/BlendshapeService';

function FlowRouter() {
  const { flowPhase, advance } = useFlow();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (flowPhase.screen === 'baseline') {
        advance({ screen: 'home' });
        return true;
      }
      if (flowPhase.screen === 'gameLoading') {
        advance({ screen: 'baseline', phase: 'capture', gameParams: flowPhase.data.gameParams });
        return true;
      }
      if (flowPhase.screen === 'game') {
        advance({ screen: 'baseline', phase: 'capture', gameParams: flowPhase.gameParams });
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [flowPhase, advance]);

  if (flowPhase.screen === 'home') {
    return <HomeScreen advance={advance} />;
  }
  if (flowPhase.screen === 'baseline') {
    return <BaselineCaptureScreen flowPhase={flowPhase} advance={advance} />;
  }
  if (flowPhase.screen === 'gameLoading' || flowPhase.screen === 'game') {
    console.log('[321FACE] FlowRouter rendering GameScreen', { screen: flowPhase.screen });
    return <GameScreen flowPhase={flowPhase} advance={advance} />;
  }
  return null;
}

function ErrorFallback({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12 }}>Something went wrong</Text>
      <Text style={{ fontSize: 14, color: '#666', fontFamily: 'monospace' }}>{error.message}</Text>
    </View>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [asset] = await Asset.loadAsync(require('./assets/warmup.png'));
        if (cancelled || !asset?.localUri) return;
        await warmupBlendshapes(asset.localUri);
      } catch {
        // Non-fatal: warmup failed, first capture will be slower
      } finally {
        if (!cancelled) setShowSplash(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (showSplash) {
    return (
      <View style={{ flex: 1 }}>
        <Image
          source={require('./assets/MASKS_ON_MARBLE.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <FlowProvider>
        <CameraProvider>
          <FlowRouter />
        </CameraProvider>
        <StatusBar style="auto" />
      </FlowProvider>
    </ErrorBoundary>
  );
}
