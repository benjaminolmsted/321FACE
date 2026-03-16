# Image Overlay Plan

## Overview

Overlay text on captured images immediately after capture and processing. Images are baked with overlays before storage/export. Baseline is always image 0. Export is hidden when fewer than 4 images. Text uses app gold color `#e6c44d`.

---

## 1. Overlay Rules (by position)

| Index | Overlay text |
|-------|--------------|
| 0 (baseline) | "3" |
| 1 | "2" |
| 2 | "1" |
| 3 | "FACE" |
| 4+ | Strike images: "SAME" / "TILT" / "ZOOM"; pass images: no overlay |

---

## 2. When to Apply Overlay

**After** the image is captured and processed (flipped, resized if needed, blendshapes extracted). Apply overlay as the next step in the pipeline, then use the overlay URI going forward.

### Baseline (image 0)
- **Where**: `BaselineCaptureScreen` → after `processBaselineFromTemp` succeeds and we have the flipped `displayUri`
- **Overlay**: "3"
- **Flow**: Flip → process (landmarks) → **overlay "3"** → pass overlay URI to game as `baselineImageUri`

### Game faces (images 1+)
- **Where**: `GameScreen.captureAndProcess` → after creating `permPath` and processing (blendshapes, strike detection)
- **Index**: Track `imageCount` (baseline + all stored faces + current). First game face = 1, second = 2, etc.
- **Overlay**:
  - Index 1 → "2"
  - Index 2 → "1"
  - Index 3 → "FACE"
  - Index 4+ → if strike: "SAME" | "TILT" | "ZOOM"; else: none
- **Flow**: Flip → resize (if needed) → extract blendshapes → determine strike → **overlay text** → `permPath` = overlay output → saveFace / strikeHistory use overlay URI

---

## 3. Export Visibility

- **Condition**: Show export controls only when `totalImageCount >= 4`
- **Total count** = 1 (baseline) + `allFaceUris.length`
- **Hide when**: total &lt; 4 (e.g. baseline + 0–2 game faces)
- **Components**: GameOverScreen — hide EXPORT VIDEO button and disable long-press image export when fewer than 4 images

---

## 4. Color

Use app gold: **`#e6c44d`**

FFmpeg `drawtext` format: `fontcolor=0xe6c44d` (or `0xFFE6C44D` for ARGB). Add border for readability: `borderw=2:bordercolor=black`.

---

## 5. Export Sequence

Full export sequence = `[baselineImageUri, ...allFaceUris]`

- Baseline is always first (image 0).
- `allFaceUris` = game faces in temporal order (strikes before passes in same round).
- All URIs should already have overlays baked in from capture time.

---

## 6. Implementation Approach

### 6.1 ImageOverlayService (FFmpeg drawtext)

`src/services/ImageOverlayService.ts`:

- `overlayTextOnImage(uri: string, text: string): Promise<string>`
  - Run FFmpeg: `-i <input> -vf "drawtext=text='<escaped>':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=96:fontcolor=0xe6c44d:borderw=2:bordercolor=black" -y <output>`
  - Return output URI (temp file in cacheDirectory)
  - Escape single quotes in text for FFmpeg (`'` → `'\''`)

### 6.2 BaselineCaptureScreen

- After `processBaselineFromTemp` succeeds:
  1. Call `overlayTextOnImage(flippedPath, '3')` → overlayUri
  2. Pass `overlayUri` (not `flippedPath`) in the `advance` payload as `displayUri` / imageUri for the baseline
- Game loading receives baseline with "3" overlay

### 6.3 GameScreen

- Inject `baselineImageUri` into flow; track `imageCount = 1` at game start (baseline only)
- In `captureAndProcess`, before `saveFace` / `setStrikeHistory`:
  1. `imageCount` = 1 + (stored faces count) + (0 or 1 for current)
  2. Determine overlay: index 1→"2", 2→"1", 3→"FACE", 4+→strike type or none
  3. If overlay needed: `permPath = await overlayTextOnImage(permPath, text)`
  4. Use `permPath` for saveFace / strikeHistory

### 6.4 GameOverScreen

- **Props**: add `baselineImageUri: string | null`
- **Export sequence**: `[baselineImageUri, ...allFaceUris].filter(Boolean)` when baseline present
- **Visibility**: `canExport = (baselineImageUri ? 1 : 0) + allFaceUris.length >= 4`
- Hide EXPORT VIDEO and long-press export when `!canExport`

### 6.5 FlowContext / Game Loading

- Pass `baselineImageUri` through to GameOverScreen when transitioning to game over
- Ensure `baselineImageUri` is available on GameScreen and passed down to GameOverScreen

---

## 7. File Cleanup

- Overlay creates temp files in `cacheDirectory`
- Delete temp overlay files after export completes
- Original permPath can be replaced in-place by overlay output to avoid extra files (overlay writes to a temp path, then we move/replace)

---

## 8. Open Questions / Notes

- **Font**: FFmpeg default font may vary by platform. Test on iOS and Android.
- **Font size**: 96pt is a starting value; adjust for image dimensions if needed.
- **Baseline path**: Confirm whether `baselineImageUri` in game phase is the same URI we get from BaselineCaptureScreen (it comes from `flowPhase.data.imageUri` after gameLoading).
