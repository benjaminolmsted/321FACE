import { Asset } from 'expo-asset';
import { requireNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';

const FFmpeg = requireNativeModule<{ executeAsync: (command: string) => Promise<boolean> }>('ExpoFfmpegLocal');
const DEFAULT_DURATION = 0.125; // seconds per image

function toFfmpegPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

/**
 * Create an MP4 from a pre-built FFmpeg concat list string.
 * @param concatListContent The full text content for the FFmpeg concat demuxer
 * @param outputPath Optional output path
 * @param audioAsset Optional require() of an MP3 asset
 */
export async function concatListToVideo(
  concatListContent: string,
  outputPath?: string,
  audioAsset?: number
): Promise<string> {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  const outPath = outputPath ?? `${docDir}321FACE_${Date.now()}.mp4`;
  const listPath = `${docDir}ffmpeg_concat_${Date.now()}.txt`;
  await FileSystem.writeAsStringAsync(listPath, concatListContent);

  let audioPath: string | null = null;
  let audioTempPath: string | null = null;
  let videoTempPath: string | null = null;

  if (audioAsset != null) {
    const asset = Asset.fromModule(audioAsset);
    await asset.downloadAsync();
    const assetUri = asset.localUri ?? asset.uri;
    const audioDest = `${docDir}ffmpeg_audio_${Date.now()}.mp3`;
    try {
      await FileSystem.copyAsync({ from: assetUri, to: audioDest });
      audioPath = audioDest;
      audioTempPath = audioDest;
    } catch (copyErr) {
      console.warn('[VideoExport] Audio copy failed:', copyErr);
    }
  }

  const listPathRaw = toFfmpegPath(listPath);

  if (audioPath) {
    const videoOnlyPath = `${docDir}ffmpeg_video_temp_${Date.now()}.mp4`;
    videoTempPath = videoOnlyPath;
    const videoOnlyRaw = toFfmpegPath(videoOnlyPath);
    const outPathRaw = toFfmpegPath(outPath);
    const audioPathRaw = toFfmpegPath(audioPath);

    const cmd1 = `-f concat -safe 0 -i ${listPathRaw} -c:v libx264 -pix_fmt yuv420p -r 24 -an ${videoOnlyRaw}`;
    const ok1 = await FFmpeg.executeAsync(cmd1);
    if (!ok1) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
      throw new Error('FFmpeg video pass failed');
    }

    const cmd2 = `-i ${videoOnlyRaw} -i ${audioPathRaw} -map 0:v -map 1:a -c:v copy -c:a aac -b:a 128k -ar 44100 -ac 2 -shortest ${outPathRaw}`;
    const ok2 = await FFmpeg.executeAsync(cmd2);
    if (!ok2) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
      if (videoTempPath) await FileSystem.deleteAsync(videoTempPath, { idempotent: true });
      throw new Error('FFmpeg audio mux failed');
    }
  } else {
    const outPathRaw = toFfmpegPath(outPath);
    const cmd = `-f concat -safe 0 -i ${listPathRaw} -c:v libx264 -pix_fmt yuv420p -r 24 ${outPathRaw}`;
    const success = await FFmpeg.executeAsync(cmd);
    if (!success) {
      await FileSystem.deleteAsync(listPath, { idempotent: true });
      throw new Error('FFmpeg failed');
    }
  }

  await FileSystem.deleteAsync(listPath, { idempotent: true });
  if (audioTempPath) await FileSystem.deleteAsync(audioTempPath, { idempotent: true });
  if (videoTempPath) await FileSystem.deleteAsync(videoTempPath, { idempotent: true });

  return outPath.startsWith('file://') ? outPath : `file://${outPath}`;
}

/**
 * Legacy wrapper: Convert a sequence of images to an MP4 video using FFmpeg concat demuxer.
 */
export async function imagesToVideo(
  imageUris: string[],
  outputPath?: string,
  durationPerImage = DEFAULT_DURATION,
  audioAsset?: number
): Promise<string> {
  if (imageUris.length === 0) throw new Error('No images to export');

  const lines: string[] = [];
  for (let i = 0; i < imageUris.length; i++) {
    lines.push(`file '${toFfmpegPath(imageUris[i])}'`);
    lines.push(`duration ${durationPerImage}`);
  }

  return concatListToVideo(lines.join('\n'), outputPath, audioAsset);
}
