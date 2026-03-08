import { NativeModule, requireNativeModule } from 'expo';

import { ExpoFfmpegLocalModuleEvents } from './ExpoFfmpegLocal.types';

declare class ExpoFfmpegLocalModule extends NativeModule<ExpoFfmpegLocalModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<ExpoFfmpegLocalModule>('ExpoFfmpegLocal');
