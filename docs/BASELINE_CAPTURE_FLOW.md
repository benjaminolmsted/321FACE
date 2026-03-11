# Baseline Capture Flow

This document describes what happens when the user captures a baseline on `BaselineCaptureScreen`.

**Refactored:** Capture is split so the UI updates immediately: `flipBaselineForDisplay()` shows the flipped image right away; `processBaselineFromTemp()` runs in the background (resize, blendshape, saveFace). Flash effect waits for processing, enforces 500ms display, then navigates.

## Entry Points

- **HomeScreen** → user taps Play (subtle/balanced/extreme) → navigate to `Baseline` with `{ mode, countdownMs }`
- **HomeScreen** → user taps Play (debug) → navigate to `Baseline` with `{ debug: true }`

## State Variables

| State | Purpose |
|-------|---------|
| `permission` | Camera permission status (null = loading, granted = ready, denied = show prompt) |
| `loading` | True while `doCapture` is running (camera → blend → save) |
| `error` | Error message when face not detected or capture fails |
| `debugImageUri` | When no face detected, URI of image passed to MediaPipe (for debugging) |
| `baselineFlash` | Path to flipped temp image — full-screen preview; temp deleted after processing + 500ms |

## Mount Behavior

```
useEffect ([]):
  clearStoredFaces()  // Wipes all stored faces on mount
```

**Issue:** This clears faces every time Baseline mounts. If user goes Back from Game and returns to Baseline, previous baseline is wiped. May be intentional (fresh run) or a bug.

## Capture Flow (`doCapture`)

1. Pre-capture: `setLoading(true)`, clear error/debug
2. Take photo: `takePictureAsync`
3. `flipBaselineForDisplay(photo.uri)` → flipped temp path (fast)
4. Start `processBaselineFromTemp(flippedPath, photo.width)` in background, store promise in ref
5. `setBaselineFlash(flippedPath)` — **UI shows flipped image immediately**
6. `finally`: `setLoading(false)` (processing continues in background)

## Post-capture: Baseline flash effect

```
useEffect (baselineFlash):
  if !baselineFlash → return
  processingPromise = processingPromiseRef.current
  async:
    result = await processingPromise
    if !result.ok → delete temp, setError, setDebugImageUri, setBaselineFlash(null)
    await delay(500ms)  // minimum display time
    delete temp, setBaselineFlash(null), replace('Game', ...)
```

- Full-screen overlay shows flipped image **immediately** (before processing completes)
- On face-detection failure: clear flash and show error right away
- On success: show at least 500ms, then navigate

## UI Structure

```
<View container>
  <CameraView />
  {baselineFlash && <baselineFlashOverlay><Image source={{ uri: baselineFlash }} /></>}
  <View overlay>
    <TouchableOpacity backBtn />
    <View messageBox> "Capture the pose you want..." </View>
    {error && <ScrollView with error + optional debugImage>}
    <View bottomBar>
      {loading ? <ActivityIndicator /> : <TouchableOpacity captureButton />}
    </View>
  </View>
</View>
```

## Service: BaselineCaptureService

- **`flipBaselineForDisplay(photoUri)`** — Flip horizontally, save to temp. Fast; returns `{ flippedPath }`. Caller shows this in UI immediately.
- **`processBaselineFromTemp(tempPath, photoWidth)`** — Resize if needed → perm, extract blendshapes, saveFace. Returns `{ ok: true }` or `{ ok: false, debugImageUri }`. Runs after UI has updated.

## Legacy notes (pre-refactor)

1. **clearStoredFaces on mount** — May clear too aggressively; unclear if intended.
2. **Two effects with different triggers** — One for clearStoredFaces, one for baselineFlashUri → navigate. Navigation lives in a separate effect from `doCapture`.
3. **doCapture dependency** — `useCallback(..., [navigation])` but doesn’t call `navigate` directly; navigation is in the flash effect. `navigation` in deps may be unnecessary.
4. **permPath used for both storage and flash** — Flash shows the resized (possibly smaller) image, not the full-size one we used for blendshape extraction.
5. **Error state vs baselineFlashUri** — On error we set `error` and `debugImageUri`; we never clear them before a retry. We do `setError(null)` at the start of `doCapture`, so a retry clears it.
6. **No face oval** — Unlike GameScreen, baseline capture has no face oval overlay for alignment.

## Suggested Cleanup

1. Extract a helper like `processBaselineCapture(photoUri) → { success, permPath, error? }` to separate capture logic from UI.
2. Consolidate navigation: either call `navigate` from `doCapture` after a delay, or have a single “next step” function called by the flash effect.
3. Document or change `clearStoredFaces` behavior on mount.
4. Add an optional face oval overlay for baseline alignment (reuse `FaceOvalOverlay` if feasible).
