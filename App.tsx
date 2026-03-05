import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { BaselineCaptureScreen } from './src/screens/BaselineCaptureScreen';
import { warmupBlendshapes } from './src/services/BlendshapeService';

const Stack = createNativeStackNavigator();

export default function App() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [asset] = await Asset.loadAsync(require('./assets/warmup.png'));
        if (cancelled || !asset?.localUri) return;
        await warmupBlendshapes(asset.localUri);
      } catch {
        // Non-fatal: warmup failed, first capture will be slower
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
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
