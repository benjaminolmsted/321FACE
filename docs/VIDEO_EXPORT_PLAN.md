# Video Export Plan (321FACE)

Use `@sheehanmunim/react-native-ffmpeg` to export a run as a slideshow-style video.

---

## 1. Install & Verify

**Do not use `ffmpeg-kit-react-native`.** Use the **@sheehanmunim/react-native-ffmpeg** fork, which includes the necessary `.aar` (Android) and `.xcframework` (iOS) files so you don't have to fetch them from the now-dead Maven repositories.

### 1.1 Install the packages

```bash
# 1. Install the fork and file-system
npx expo install @sheehanmunim/react-native-ffmpeg expo-file-system

# 2. Install the configuration plugin to bridge the gap
npx expo install @spreen/ffmpeg-kit-react-native-config
```

### 1.2 Configure app.json (or app.config.js)

Add the FFmpeg config plugin so the Expo build process (EAS) uses the "full-gpl" package, which includes the codecs necessary for H.264 video export:

```json
{
  "expo": {
    "plugins": [
      [
        "@spreen/ffmpeg-kit-react-native-config",
        {
          "package": "full-gpl",
          "android": { "package": "full-gpl" },
          "ios": { "package": "full-gpl" }
        }
      ]
    ]
  }
}
```

### 1.3 Verify

- Build with `npx expo run:android` / `npx expo run:ios`
- Prebuild: run `npx expo prebuild` if needed

---

## 2. Data Model

### 2.1 Current State at Game Over

- `strikeHistory`: `StrikeDetail[]` with `currentImageUri`, `previousImageUri` per strike
- Passed faces: cleared via `clearStoredFaces()` before Game Over
- Stored faces (baseline + passed): unavailable at Game Over

### 2.2 Options for Video Source

| Option | Pros | Cons |
|--------|------|------|
| **A. Full run** | Video shows full progression (baseline → passed → strikes); richer output | Must pass `allFaceUris` to GameOverScreen before clearing storage; defer `clearStoredFaces` to Play Again |
| **B. Strike-only** | No GameScreen changes; only use `strikeHistory` | Short video; no context of successful faces |

**Recommendation**: Use **Option A (full run)** as the primary export. Pass `allFaceUris: string[]` to GameOverScreen before clearing storage.

---

## 3. FFmpeg Approach: Image Sequence → Video

### 3.1 Concat Demuxer

1. Create a temporary text file with:
   ```
   file '/path/to/image1.jpg'
   duration 2
   file '/path/to/image2.jpg'
   duration 2
   file '/path/to/image3.jpg'
   duration 2
   ```
2. Run:
   ```bash
   ffmpeg -f concat -safe 0 -i list.txt -c:v libx264 -pix_fmt yuv420p -r 15 output.mp4
   ```

- `-r 15`: 15 fps (doesn’t matter for slideshow, but required)
- `duration N`: seconds per image (e.g. 2)
- Repeat last image in the list for correct end duration

### 3.2 File Paths

- Use `expo-file-system` `documentDirectory` for temp files
- Images are already on disk (`permPath` in `FileSystem.documentDirectory`)
- URIs are `file:///...` — FFmpeg needs filesystem paths

### 3.3 Platform Path Handling

```typescript
import * as FileSystem from 'expo-file-system';

function toFfmpegPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}
```

---

## 4. New Service: `VideoExportService.ts`

```
src/services/VideoExportService.ts
```

### Responsibilities

- `imagesToVideo(imageUris: string[], outputPath: string, durationPerImage?: number): Promise<string>`
- Write concat list to temp file
- Call `FFmpegKit.execute(...)` with concat command
- Clean up temp list file
- Return output path

### Skeleton

```typescript
import FFmpegKit from '@sheehanmunim/react-native-ffmpeg';
import * as FileSystem from 'expo-file-system';

const DEFAULT_DURATION = 2; // seconds per image

function toFfmpegPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

export async function imagesToVideo(
  imageUris: string[],
  outputPath: string,
  durationPerImage = DEFAULT_DURATION
): Promise<string> {
  if (imageUris.length === 0) throw new Error('No images to export');

  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('No document directory');

  const listPath = `${docDir}ffmpeg_concat_${Date.now()}.txt`;
  const lines: string[] = [];

  for (let i = 0; i < imageUris.length; i++) {
    lines.push(`file '${toFfmpegPath(imageUris[i])}'`);
    lines.push(`duration ${durationPerImage}`);
  }
  lines.push(`file '${toFfmpegPath(imageUris[imageUris.length - 1])}'`); // repeat last

  await FileSystem.writeAsStringAsync(listPath, lines.join('\n'));

  const cmd = `-f concat -safe 0 -i ${toFfmpegPath(listPath)} -c:v libx264 -pix_fmt yuv420p -r 15 ${outputPath}`;
  const session = await FFmpegKit.execute(cmd);

  await FileSystem.deleteAsync(listPath, { idempotent: true });

  if (!session.getReturnCode().isValueSuccess()) {
    throw new Error('FFmpeg failed: ' + session.getFailStackTrace());
  }

  return outputPath;
}
```

---

## 5. GameOverScreen Integration

### 5.1 New Prop (required for full-run export)

```typescript
allFaceUris: string[];  // baseline + passed + strike faces in order
```

### 5.2 Image Order for Video

- **Option A (full run)** — primary:  
  Use `allFaceUris` as-is. Faces are in **temporal order**: baseline → passed → strikes, with **strikes before passes** when they share the same round (tie-breaker for ordering).

- If `allFaceUris` is empty, do **not** show the Export video button (no fallback).

### 5.3 New Button

- Add `Export video` next to `Export images`
- **Disable** (or hide) the button when `allFaceUris` is empty — no strike-only fallback
- On press: call `VideoExportService.imagesToVideo(allFaceUris, ...)` → save to Media Library
- Use `MediaLibrary.saveToLibraryAsync(videoPath)` (or equivalent for video files)
- Loading state: `exportingVideo` while FFmpeg runs

### 5.4 Permissions

- Photo library already requested for image export
- Same permission covers saving video

---

## 6. GameScreen Changes (required for full-run export)

1. **Before** calling `clearStoredFaces()` on game over: call `getFacesForRound(roundIndex)` to get baseline + passed faces (ordered by round).
2. Append strike faces from `strikeHistory` (`currentImageUri` for each strike) to build `allFaceUris`.
3. Pass `allFaceUris` to `GameOverScreen`.
4. Defer `clearStoredFaces()` to `handlePlayAgain` only — remove the early clear when `newStrikes >= maxStrikes`. This keeps stored faces available until the user leaves the Game Over screen.

---

## 7. Error Handling

- FFmpeg session failure → show alert “Video export failed”
- No images (`allFaceUris` empty) → disable the Export video button
- Permission denied → same flow as image export
- Large runs (many images) → FFmpeg may take a while; consider progress or “This may take a minute” message

---

## 8. Implementation Order

1. Install @sheehanmunim/react-native-ffmpeg, @spreen/ffmpeg-kit-react-native-config, expo-file-system; add plugin to app.json; verify build
2. Create `VideoExportService.ts` with `imagesToVideo`
3. Update GameScreen: build `allFaceUris` before game over, pass to GameOverScreen, defer `clearStoredFaces()` to `handlePlayAgain`
4. Add “Export video” to GameOverScreen; disable when `allFaceUris` is empty

---

## 9. FFmpeg Command Reference

```
-f concat        use concat demuxer
-safe 0          allow absolute paths in list
-i list.txt      input concat list
-c:v libx264     H.264 video codec
-pix_fmt yuv420p compatibility (many players)
-r 15            output frame rate
output.mp4       output file
```
