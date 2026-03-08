import * as React from 'react';

import { ExpoFfmpegLocalViewProps } from './ExpoFfmpegLocal.types';

export default function ExpoFfmpegLocalView(props: ExpoFfmpegLocalViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
