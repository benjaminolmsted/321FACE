export const FACE_TIERS = [
  { threshold: 400, emoji: '🥰' },
  { threshold: 300, emoji: '😍' },
  { threshold: 200, emoji: '🥹' },
  { threshold: 175, emoji: '🫡' },
  { threshold: 150, emoji: '🎭' },
  { threshold: 125, emoji: '🤖' },
  { threshold: 100, emoji: '🥵' },
  { threshold: 75, emoji: '🤯' },
  { threshold: 50, emoji: '🥳' },
  { threshold: 35, emoji: '🤭' },
  { threshold: 25, emoji: '🫣' },
  { threshold: 20, emoji: '😋' },
  { threshold: 15, emoji: '☺️' },
  { threshold: 10, emoji: '😀' },
  { threshold: 5, emoji: '🫠' },
  { threshold: 1, emoji: '😐' },
] as const;

export function getFaceEmoji(score: number): string {
  const tier = FACE_TIERS.find((t) => score >= t.threshold);
  return tier ? tier.emoji : '😐';
}
