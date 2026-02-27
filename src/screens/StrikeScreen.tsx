import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  reason: 'similar' | 'tilt';
  currentImageUri: string;
  previousImageUri?: string;
  strikes: number;
  onContinue: () => void;
};

export function StrikeScreen({
  reason,
  currentImageUri,
  previousImageUri,
  strikes,
  onContinue,
}: Props) {
  const isTilt = reason === 'tilt';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{isTilt ? 'TILT!!!' : 'Strike!'}</Text>
      <Text style={styles.subtitle}>
        {isTilt ? 'Face too tilted' : 'Similar Faces Detected'}
      </Text>
      <Text style={styles.strikes}>Strikes: {strikes} / 3</Text>

      <View style={styles.images}>
        {previousImageUri && (
          <View style={styles.imageBox}>
            <Text style={styles.imageLabel}>Previous</Text>
            <Image source={{ uri: previousImageUri }} style={styles.image} resizeMode="cover" />
          </View>
        )}
        <View style={styles.imageBox}>
          <Text style={styles.imageLabel}>Current</Text>
          <Image source={{ uri: currentImageUri }} style={styles.image} resizeMode="cover" />
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={onContinue} activeOpacity={0.8}>
        <Text style={styles.buttonText}>
          {strikes >= 3 ? 'Game Over - Play Again' : 'Continue'}
        </Text>
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
    padding: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#c00',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
  },
  strikes: {
    fontSize: 16,
    marginBottom: 24,
  },
  images: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
  },
  imageBox: {
    alignItems: 'center',
  },
  imageLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  button: {
    backgroundColor: '#000',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
