import { requireNativeView } from 'expo';
import * as React from 'react';

import { ExpoFfmpegLocalViewProps } from './ExpoFfmpegLocal.types';

const NativeView: React.ComponentType<ExpoFfmpegLocalViewProps> =
  requireNativeView('ExpoFfmpegLocal');

export default function ExpoFfmpegLocalView(props: ExpoFfmpegLocalViewProps) {
  return <NativeView {...props} />;
}
