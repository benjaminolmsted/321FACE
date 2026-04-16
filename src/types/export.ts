import type { StrikeReason } from '../services/FaceComparisonService';

export type FrameEntry = {
  uri: string;
  role: 'pass' | 'strike';
  strikeType?: StrikeReason;
  roundIndex: number;
  blendshapes: number[];
};

export type FrameOrdering = 'chronological' | 'nearest-neighbor';

export type ManifestConfig = {
  countdownRepeat: number;
  strikeRepeat: number;
  passRepeat: number;
  durationPerFrame: number;
  ordering: FrameOrdering;
};

export type ManifestFrame = {
  sourceUri: string;
  overlayUri?: string;
  label?: string;
  labelColor?: string;
  repeat: number;
  durationPerRepeat: number;
};

export type ExportManifest = {
  frames: ManifestFrame[];
  totalFrameCount: number;
  totalDuration: number;
};

export const DEFAULT_MANIFEST_CONFIG: ManifestConfig = {
  countdownRepeat: 3,
  strikeRepeat: 1,
  passRepeat: 1,
  durationPerFrame: 0.125,
  ordering: 'chronological',
};
