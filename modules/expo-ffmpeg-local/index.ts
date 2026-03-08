// Reexport the native module. On web, it will be resolved to ExpoFfmpegLocalModule.web.ts
// and on native platforms to ExpoFfmpegLocalModule.ts
export { default } from './src/ExpoFfmpegLocalModule';
export { default as ExpoFfmpegLocalView } from './src/ExpoFfmpegLocalView';
export * from  './src/ExpoFfmpegLocal.types';
