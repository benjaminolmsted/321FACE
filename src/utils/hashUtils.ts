/**
 * Simple djb2-style hash for number arrays. Returns hex string.
 */
export function hashNumbers(nums: number[]): string {
  let h = 5381;
  for (let i = 0; i < nums.length; i++) {
    h = ((h << 5) + h) ^ nums[i];
  }
  return (h >>> 0).toString(16);
}

/**
 * First N characters of a hash string.
 */
export function hashPreview(hash: string, n = 10): string {
  return hash.slice(0, n);
}

/**
 * Hash float embedding for fingerprint (rounds to 6 decimals for consistency).
 */
export function hashEmbedding(embedding: number[]): string {
  const rounded = embedding.map((v) => Math.round(v * 1e6));
  return hashNumbers(rounded);
}
