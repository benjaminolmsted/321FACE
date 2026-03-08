# Video Export Plan (321FACE)

Export a run as a slideshow-style video using FFmpeg via a **local Expo module** that bundles the ffmpeg-kit-full-gpl binary.

---

## 1. FFmpeg Setup: Local Module (Self-Bundled)

**Do not use `ffmpeg-kit-react-native`.** The official ffmpeg-kit binaries were removed from Maven (only 4KB metadata shells remain). This project uses a **local Expo module** with a manually bundled Fat AAR.

### 1.1 Manually Bundle the "Ghost" Dependency

- Obtain a Fat AAR (~40MB) containing C++ libraries for multiple CPU architectures (ffmpeg-kit-full-gpl).
- Place it at `modules/expo-ffmpeg-local/android/libs/ffmpeg-kit-full-gpl.aar`.
- This locks the binary into the local filesystem instead of relying on dead Maven repositories.

### 1.2 Local Expo Module Structure

The `modules/expo-ffmpeg-local` module acts as a protected container for:
- Native Kotlin (Android) / Swift (iOS) code that wraps FFmpegKit
- The FFmpeg binary (`.aar` on Android, `.xcframework` on iOS)
- Stays in the Managed Workflow while providing Bare Workflow power

**Android** (`modules/expo-ffmpeg-local/android/build.gradle`):
- `flatDir { dirs 'libs' }` so Gradle finds the local AAR
- `implementation(name: 'ffmpeg-kit-full-gpl', ext: 'aar')` to link the binary
- `implementation("com.arthenica:smart-exception-java:0.2.1")` — FFmpeg expects these Java helpers
- `JavaVersion.VERSION_17` and `jvmTarget = '17'` to match the 2026 Expo ecosystem

### 1.3 Gradle Scoping (Root build.gradle)

The main app must know where to find the `.aar` during assembly. Add to `android/build.gradle`:

```gradle
allprojects {
  repositories {
    // ... existing repos ...
    flatDir {
      dirs "$rootDir/../modules/expo-ffmpeg-local/android/libs"
    }
  }
}
```

### 1.4 JVM Synchronization

Force the local module to use Java 17 so Kotlin/Java compilers align with the rest of the Expo 2026 ecosystem.

### 1.5 Next: Expose FFmpeg to JavaScript

The module scaffold exists; add an `AsyncFunction` that wraps `FFmpegKit.execute()` so the app can run FFmpeg commands from JS. The VideoExportService will call this.

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

Uses the local `ExpoFfmpegLocal` module (which wraps FFmpegKit from the bundled AAR):

```typescript
import { requireNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system';

const FFmpeg = requireNativeModule('ExpoFfmpegLocal');
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
  const success = await FFmpeg.executeAsync(cmd);

  await FileSystem.deleteAsync(listPath, { idempotent: true });

  if (!success) {
    throw new Error('FFmpeg failed');
  }

  return outputPath;
}
```

**Note:** The local module must expose `executeAsync(command: string): Promise<boolean>` that wraps `FFmpegKit.execute()` and returns whether the session succeeded.

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

1. Complete local module: add `executeAsync(command)` to ExpoFfmpegLocalModule (wraps FFmpegKit.execute); verify build
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
