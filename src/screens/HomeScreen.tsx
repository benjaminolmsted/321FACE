import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  onPlay: () => void;
};

export function HomeScreen({ onPlay }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>321FACE</Text>
      <Text style={styles.subtitle}>Make a different face each round</Text>
      <TouchableOpacity style={styles.button} onPress={onPlay} activeOpacity={0.8}>
        <Text style={styles.buttonText}>Play</Text>
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
  },
  buttonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});
