import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Text, View } from 'react-native';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { BaselineCaptureScreen } from './src/screens/BaselineCaptureScreen';
import { warmupBlendshapes } from './src/services/BlendshapeService';

const Stack = createNativeStackNavigator();

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
      <View style={{ flex: 1, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={require('./assets/splash-icon.png')}
          style={{ width: 200, height: 200 }}
          resizeMode="contain"
        />
      </View>
    );
  }

  return (
    <ErrorBoundary>
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen name="Home" component={HomeWrapper} />
        <Stack.Screen name="Baseline" component={BaselineCaptureScreen} />
        <Stack.Screen name="Game" component={GameScreen} />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
    </ErrorBoundary>
  );
}

function HomeWrapper({ navigation }: { navigation: { navigate: (name: string, params?: object) => void } }) {
  return (
    <HomeScreen
      onPlay={(mode) => navigation.navigate('Baseline', { mode })}
      onPlayDebug={() => navigation.navigate('Baseline', { debug: true })}
    />
  );
}
