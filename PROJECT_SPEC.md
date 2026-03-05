# 321FACE — Project Specification for Implementation

## Overview

**321FACE** is a React Native / Expo mobile game where the user must make a *different* face each round. The app captures the user’s face via the front camera, compares it to a baseline and previous rounds using MediaPipe Face Landmarker (blendshapes, pose, inter-ocular distance), and awards strikes when the user’s face is too similar, tilted, or zoomed compared to the baseline. Three strikes = game over.

---

## Core Game Logic

### Flow

1. **Home** → User taps “Play”
2. **Baseline Capture** → User takes a selfie as the baseline pose (stored as round 0)
3. **Game** → Rounds 1, 2, 3…
   - Countdown: `3... 2.. 1. FACE` (1.25s total)
   - On “FACE”, camera auto-captures
   - Face is compared to baseline and prior rounds
   - If **strike**: show flash (TILT / ZOOM / SAME), increment strikes
   - If **no strike**: save face as that round’s reference, advance to next round, start countdown again
4. **Game Over** at 3 strikes → Show strike history, allow export of images, play again

### Strike Rules (play mode only)

| Strike | Condition | Meaning |
|-------|-----------|---------|
| **TILT** | `|pitch| > 15°` OR `|roll| > 15°` | Head too tilted vs baseline |
| **ZOOM** | `|currentIod - baselineIod| / baselineIod > 0.10` | Face too close or far vs baseline (inter-ocular distance) |
| **SAME** | `min(blendshapeDistance(current, prev)) < 0.17` | Face too similar to any previous round (expression not different enough) |

- **Inter-ocular distance (IOD)**: Euclidean distance between MediaPipe landmarks 33 (left eye) and 263 (right eye), normalized 0–1.
- **Blendshape distance**: Euclidean distance between 52-dimensional blendshape score vectors.

### Config (from constants)

- `MAX_STRIKES`: 3
- `TILT_THRESHOLD_DEGREES`: 15
- `BLENDSHAPE_DISTANCE_THRESHOLD`: 0.17
- `INTER_OCULAR_ZOOM_THRESHOLD`: 0.1 (10%)

---

## Technical Stack

- **Expo** ~54, **React Native** 0.81
- **expo-camera** (`CameraView`) — front camera, `ratio="4:3"`
- **expo-image-manipulator** — horizontal flip for selfies before analysis
- **expo-file-system** — save images to `documentDirectory`
- **react-native-mediapipe** v0.6 — Face Landmarker for blendshapes, landmarks, pose
- **@react-native-async-storage/async-storage** — store face data per round
- **@react-navigation/native** + **native-stack** — Home, Baseline, Game
- **react-native-svg** — face oval overlay

---

## Screens & Components

### Screens

- **HomeScreen**: Title “321FACE”, subtitle “Make a different face each round”, “Play” and “Play (debug)” buttons
- **BaselineCaptureScreen**: Full-screen front camera, capture button, saves baseline (round 0) via `extractBlendshapes` → `saveFace` → navigate to Game
- **GameScreen**: Camera with overlay, countdown, capture flow, StrikeScreen flash, GameOverScreen when done
- **StrikeScreen**: Shows strike reason (TILT / ZOOM / SAME), previous + current image, strike count, Continue / Play Again
- **GameOverScreen**: Strike list, export images to media library, Play Again

### Main Components

- **FaceOvalOverlay**: Draws baseline face oval from MediaPipe landmarks over the camera. Handles `fit` vs `fill` preview scaling; landmarks normalized 0–1 from source image.
- **Countdown**: `3... 2.. 1. FACE` over 1.25s; `onFace` fires at “FACE” to trigger capture.

---

## Services

### BlendshapeService

- Uses `faceLandmarkDetectionOnImage(imagePath, 'face_landmarker.task', options)` from `react-native-mediapipe`
- Returns: 52 blendshapes, 478 landmarks (normalized 0–1), face pose (pitch/roll/yaw), timing
- Warmup: call with a face image on app start to pre-load the model (non-fatal if it fails)
- `blendshapeDistance(a, b)`: Euclidean distance
- `getInterOcularDistance(landmarks)`: distance between landmarks 33 and 263

### StorageService

- AsyncStorage key: `@321face_faces`
- `StoredFaceData`: roundIndex, imageUri, blendshapes, faceLandmarks, facePose, sourceImageWidth/Height, interOcularDistance, timestamp
- `saveFace`, `loadStoredFaces`, `clearStoredFaces`, `getFacesForRound(roundIndex)` (returns faces with `roundIndex < round`)

---

## Image Pipeline

1. `takePictureAsync` → photo URI
2. `ImageManipulator.manipulateAsync(uri, [{ flip: Horizontal }], { compress: 0.9, format: JPEG })`
3. `FileSystem.copyAsync` to `documentDirectory/face_*.jpg`
4. Pass file path (with `file://` prefix) to `extractBlendshapes`

---

## Data Flow (GameScreen)

- **Round 0**: Baseline capture only (BaselineCaptureScreen).
- **Round 1+**: `getFacesForRound(roundIndex)` returns all prior faces. Compare current blendshapes to each; compute min blendshape distance. Compare pose for tilt, IOD for zoom.
- If strike: show flash, increment strikes, optionally restart countdown. If 3 strikes → game over.
- If no strike: `saveFace` with current data, increment round, restart countdown.

---

## Known Issues to Fix

### 1. AsyncStorage Android build

- Error: `Could not find org.asyncstorage.shared_storage:storage-android:1.0.0`
- Fix: In `android/build.gradle`, add to `allprojects.repositories`:
  ```groovy
  maven {
    url new File(rootProject.projectDir, "../node_modules/@react-native-async-storage/async-storage/android/local_repo").toURI()
  }
  ```

### 2. MediaPipe Face Landmarker “failed to detect”

- Error: `Face Landmarker failed to detect` — `faceLandmarker.detect(mpImage)` returns null.
- Causes:
  - **Warmup image**: `assets/warmup.png` is solid black; use a real face image.
  - **EXIF orientation**: `react-native-mediapipe` uses `BitmapFactory.decodeFile()`, which does **not** apply EXIF. Images with orientation metadata (e.g. front-camera) may appear rotated; MediaPipe sees a sideways face and fails.
- Fixes:
  - Replace `assets/warmup.png` with a valid face photo (e.g. CC0 portrait).
  - Ensure images passed to MediaPipe have orientation baked into pixels. Either:
    - Run images through `expo-image-manipulator` (which respects EXIF) and re-save before extraction, or
    - Extend the native module to apply EXIF when loading (e.g. ExifInterface + rotate bitmap).

### 3. Camera overlay scaling

- `FaceOvalOverlay` needs `previewScaleMode`: `fit` for Android (4:3 ratio), `fill` for iOS, to match how `CameraView` scales the preview.

---

## File Structure (Key Files)

```
src/
├── screens/
│   ├── HomeScreen.tsx
│   ├── BaselineCaptureScreen.tsx
│   ├── GameScreen.tsx
│   ├── StrikeScreen.tsx
│   ├── GameOverScreen.tsx
│   └── DebugScreen.tsx
├── components/
│   ├── FaceOvalOverlay.tsx
│   └── Countdown.tsx (or useCountdown3251)
├── services/
│   ├── BlendshapeService.ts
│   └── StorageService.ts
├── hooks/
│   └── useCountdown3251.ts
└── utils/
    └── constants.ts
assets/
└── warmup.png  (must be a real face image)
```

---

## Debug Mode

- “Play (debug)” skips baseline and goes straight to Game with `playMode: false`.
- In debug, strikes are not counted; faces are still captured and compared for logging.

---

## Implementation Checklist

- [ ] Create Expo app with dependencies above
- [ ] Add AsyncStorage local_repo to Android Gradle
- [ ] Implement BlendshapeService (MediaPipe face_landmarker.task)
- [ ] Implement StorageService
- [ ] Build HomeScreen, BaselineCaptureScreen, GameScreen
- [ ] Implement capture → flip → save → extractBlendshapes flow
- [ ] Implement strike logic (tilt, zoom, similar)
- [ ] Add FaceOvalOverlay with correct preview scaling
- [ ] Add countdown (3... 2.. 1. FACE) with auto-capture
- [ ] Add StrikeScreen and GameOverScreen
- [ ] Replace warmup.png with valid face image
- [ ] Fix EXIF/orientation for images before MediaPipe (if detection still fails)
