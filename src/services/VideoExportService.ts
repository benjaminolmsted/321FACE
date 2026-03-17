import { Asset } from 'expo-asset';
import { requireNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';

const FFmpeg = requireNativeModule<{ executeAsync: (command: string) => Promise<boolean> }>('ExpoFfmpegLocal');
const DEFAULT_DURATION = 0.125; // seconds per image

function toFfmpegPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}


/**
 * Convert a sequence of images to an MP4 video using FFmpeg concat demuxer.
 * Export format: MP4 (H.264 video, AAC audio).
 * @param imageUris File URIs (file://...) for each image
 * @param outputPath Optional. Defaults to documentDirectory/321FACE_{timestamp}.mp4
 * @param durationPerImage Seconds to show each image (default 0.55)
 * @param audioAsset Optional. require() of an MP3 asset (e.g. require('../assets/vaporwave.mp3'))
 * @returns The output file URI
 */
export async function imagesToVideo(
  imageUris: string[],
  outputPath?: string,
  durationPerImage = DEFAULT_DURATION,
  audioAsset?: number
): Promise<string> {
  if (imageUris.length === 0) throw new Error('No images to export');

  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  console.log('[VideoExport] imagesToVideo: start, imageCount=', imageUris.length, 'docDir=', docDir, 'audioAsset=', !!audioAsset);

  const outPath = outputPath ?? `${docDir}321FACE_${Date.now()}.mp4`;
  const listPath = `${docDir}ffmpeg_concat_${Date.now()}.txt`;
  const lines: string[] = [];

  for (let i = 0; i < imageUris.length; i++) {
    lines.push(`file '${toFfmpegPath(imageUris[i])}'`);
    lines.push(`duration ${durationPerImage}`);
  }
  // No repeat of last file - each file has explicit duration; repeat caused last frame to show indefinitely

  console.log('[VideoExport] Writing concat list to', listPath);
  await FileSystem.writeAsStringAsync(listPath, lines.join('\n'));
  console.log('[VideoExport] Concat list written');

  let audioPath: string | null = null;
  let audioTempPath: string | null = null;
  let videoTempPath: string | null = null;
  if (audioAsset != null) {
    const asset = Asset.fromModule(audioAsset);
    await asset.downloadAsync();
    const assetUri = asset.localUri ?? asset.uri;
    console.log('[VideoExport] Audio asset resolved to', assetUri);
    const audioDest = `${docDir}ffmpeg_audio_${Date.now()}.mp3`;
    try {
      await FileSystem.copyAsync({ from: assetUri, to: audioDest });
      audioPath = audioDest;
      audioTempPath = audioDest;
      console.log('[VideoExport] Audio copied to documentDirectory');
    } catch (copyErr) {
      console.warn('[VideoExport] Audio copy failed:', copyErr);
    }
  }

  const listPathRaw = toFfmpegPath(listPath);

  if (audioPath) {
    // Two-pass: create video first, then mux audio (more reliable than single-pass)
    const videoOnlyPath = `${docDir}ffmpeg_video_temp_${Date.now()}.mp4`;
    videoTempPath = videoOnlyPath;
    const videoOnlyRaw = toFfmpegPath(videoOnlyPath);
    const outPathRaw = toFfmpegPath(outPath);
    const audioPathRaw = toFfmpegPath(audioPath);

    const cmd1 = `-f concat -safe 0 -i ${listPathRaw} -c:v libx264 -pix_fmt yuv420p -r 15 -an ${videoOnlyRaw}`;
    console.log('[VideoExport] FFmpeg pass 1 (video only):', cmd1);
    const ok1 = await FFmpeg.executeAsync(cmd1);
    if (!ok1) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
      throw new Error('FFmpeg video pass failed');
    }

    const cmd2 = `-i ${videoOnlyRaw} -i ${audioPathRaw} -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 -shortest ${outPathRaw}`;
    console.log('[VideoExport] FFmpeg pass 2 (mux audio):', cmd2);
    const ok2 = await FFmpeg.executeAsync(cmd2);
    if (!ok2) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
      if (videoTempPath) await FileSystem.deleteAsync(videoTempPath, { idempotent: true });
      throw new Error('FFmpeg audio mux failed');
    }
  } else {
    // Video only
    const outPathRaw = toFfmpegPath(outPath);
    const cmd = `-f concat -safe 0 -i ${listPathRaw} -c:v libx264 -pix_fmt yuv420p -r 15 ${outPathRaw}`;
    console.log('[VideoExport] FFmpeg (no audio):', cmd);
    const success = await FFmpeg.executeAsync(cmd);
    if (!success) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      throw new Error('FFmpeg failed');
    }
  }

  await FileSystem.deleteAsync(listPath, { idempotent: true });
  if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
  if (videoTempPath) await FileSystem.deleteAsync(videoTempPath, { idempotent: true });
  console.log('[VideoExport] Temp files deleted');

  const result = outPath.startsWith('file://') ? outPath : `file://${outPath}`;
  console.log('[VideoExport] imagesToVideo: returning', result);
  return result;
}
