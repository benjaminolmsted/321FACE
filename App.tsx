import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from './src/screens/HomeScreen';
import { GameScreen } from './src/screens/GameScreen';
import { BaselineCaptureScreen } from './src/screens/BaselineCaptureScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
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
      onPlay={() => navigation.navigate('Baseline')}
      onPlayDebug={() => navigation.navigate('Game')}
    />
  );
}
