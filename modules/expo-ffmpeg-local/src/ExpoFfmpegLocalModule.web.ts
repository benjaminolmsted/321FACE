import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './ExpoFfmpegLocal.types';

type ExpoFfmpegLocalModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class ExpoFfmpegLocalModule extends NativeModule<ExpoFfmpegLocalModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(ExpoFfmpegLocalModule, 'ExpoFfmpegLocalModule');
