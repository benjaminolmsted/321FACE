import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  onPlay: () => void;
  onPlayDebug: () => void;
};

export function HomeScreen({ onPlay, onPlayDebug }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>321FACE</Text>
      <Text style={styles.subtitle}>Make a different face each round</Text>
      <TouchableOpacity style={styles.button} onPress={onPlay} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onPlayDebug} activeOpacity={0.8}>
        <Text style={styles.buttonTextSecondary}>Play (debug)</Text>
      </TouchableOpacity>
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
});
