# Black Screen After PLAY — Step-by-Step Flow

## Current flow (after gameLoading fix)

1. **PLAY tap** → advance to `gameLoading` with `BaselineCapturedData` (imageUri, gameParams, etc.)
2. **FlowRouter** → renders `GameScreen` with `flowPhase.screen === 'gameLoading'`
3. **GameScreen** mounts, reads `imageUri` from `flowPhase.data`
4. **Baseline overlay** shows while `!cameraReady` — same Image + overlay as before
5. **When `onCameraReady`** → advance to `game`, baseline overlay hides

## Fixes applied

- **gameLoading phase** — GameScreen handles both `game` and `gameLoading`; no separate screen switch
- **elevation: 999** — on Android, overlay uses `elevation` so it can sit above the CameraView
- **`file://` on Android** — Image `uri` gets `file://` prefix if missing on Android

---

## What *should* happen when you tap PLAY (detailed)

### Step 1: User taps PLAY on Baseline Captured screen
- **Component:** `BaselineCapturedScreen`
- **Action:** `onPlay()` is called
- **Data at this moment:** `imageUri` = path like `file:///data/user/0/.../face_baseline_temp_1234567890.jpg` (from `flowPhase.data.imageUri`)

### Step 2: `advance()` is called
```javascript
advance({
  screen: 'game',
  phase: 'countdown',
  gameParams,
  baselineImageUri: imageUri,  // ← the same path that displayed the image
});
```

### Step 3: FlowProvider updates state
- **Component:** `FlowProvider` (in App.tsx)
- **Action:** `setFlowPhase(next)` runs
- **New flowPhase:** `{ screen: 'game', phase: 'countdown', gameParams, baselineImageUri: "<path>" }`

### Step 4: FlowRouter re-renders
- **Component:** `FlowRouter`
- **Logic:** `flowPhase.screen === 'game'` → returns `<GameScreen flowPhase={flowPhase} advance={advance} />`
- **Result:** `BaselineCapturedScreen` unmounts, `GameScreen` mounts

### Step 5: GameScreen first render
- **Receives:** `flowPhase` = `{ screen: 'game', phase: 'countdown', gameParams, baselineImageUri: "<path>" }`
- **Destructures:** `const { gameParams, baselineImageUri } = flowPhase`
- **State:** `cameraReady` = false (initial), `permission` = could be null | { granted: true } | { granted: false }

### Step 6: GameScreen render logic
1. **Permission check:** `if (!permission && !baselineImageUri)` → show loading spinner (we SKIP this when we have baselineImageUri)
2. **Permission denied:** `if (permission && !permission.granted)` → show permission UI (we SKIP when we have baselineImageUri and permission is granted or still loading)
3. **Main return:** renders `<View container>`, `<CameraView>`, and the Modal block:

```javascript
{baselineImageUri && !cameraReady && (
  <Modal visible transparent animationType="none">
    <View style={styles.baselineWarmupModal}>   // flex: 1, backgroundColor: '#000'
      <Image source={{ uri: baselineImageUri }} ... />
      <View style={styles.overlay}>  // back button, round, countdown
        ...
      </View>
    </View>
  </Modal>
)}
```

### Step 7: What you should see
- **Modal** with a black background (`#000`)
- **Image** using `baselineImageUri` as `uri` filling the modal
- **Overlay** on top: Back button, Round 1, Strikes 0/3, countdown (3... 2.. 1. FACE when it starts)

---

## Failure points (why it might be black)

### A. `baselineImageUri` is falsy
- **Symptom:** Modal would never render, or render with nothing
- **Cause:** `advance()` didn’t receive it, or it was dropped somewhere
- **Check:** `flowPhase.baselineImageUri` in GameScreen’s first render

### B. Image fails to load
- **Symptom:** Modal shows, View is black, Image is empty or errored
- **Cause:** URI format wrong on Android (e.g. needs `file://` or different format)
- **Cause:** File missing or inaccessible when GameScreen loads
- **Note:** Same URI works on BaselineCapturedScreen, so file and format should be fine unless timing differs

### C. Modal doesn’t show
- **Symptom:** Camera preview (black) appears, Modal never appears
- **Cause:** Modal on Android not rendering as expected (transparent, stacking, etc.)
- **Check:** Does the Modal block even run? Is `baselineImageUri && !cameraReady` ever true?

### D. CameraView covers everything
- **Symptom:** You only see black from CameraView
- **Cause:** Native camera surface is above the Modal
- **Note:** Modal is supposed to render above native views; if this fails, we’d still see black

### E. Wrong `flowPhase` on first render
- **Symptom:** GameScreen renders with `flowPhase` that has no `baselineImageUri`
- **Cause:** Stale closure, batching, or FlowRouter passing wrong phase
- **Check:** First GameScreen render: `flowPhase.screen === 'game'`, `flowPhase.baselineImageUri` is the path

---

## Recommended debug steps

Add temporary logs in GameScreen to confirm behavior:

```javascript
// At the top of GameScreen, right after destructuring:
console.log('[321FACE] GameScreen render', {
  screen: flowPhase.screen,
  baselineImageUri: baselineImageUri ? `${baselineImageUri.slice(0, 50)}...` : 'UNDEFINED',
  cameraReady,
  permission: permission?.granted ?? 'loading',
  modalShouldShow: !!(baselineImageUri && !cameraReady),
});
```

Then tap PLAY and check Metro logs:

1. **If `baselineImageUri` is UNDEFINED:** Issue is in the `advance()` call or FlowProvider
2. **If `modalShouldShow: true` and it’s still black:** Image loading or URI format issue
3. **If `modalShouldShow: false`:** Condition logic is wrong
4. **If you see no log:** GameScreen might not mount for another reason (e.g. crash)

---

## Z-ordering

```
container (flex: 1)
├── CameraView (flex: 1)           ← native view; can render on its own surface
├── baselineWarmupOverlay          ← View, absoluteFill, zIndex: 999, elevation: 999
│   ├── Image (baseline)
│   └── overlay (Back, round, strikes)
├── resultFlashOverlay (zIndex: 12)
└── showCameraUI overlay
```

On Android, `CameraView` is a native component (SurfaceView/TextureView) and may draw above React Native siblings despite `zIndex`/`elevation`. `elevation: 999` helps but can fail on some devices.

**Fix:** Use `<Modal visible transparent>` for the baseline overlay instead of a View — Modal renders in a separate window and typically sits above native views.

## Off-screen camera warmup

expo-camera has no prepareAsync or warmup API. To warm up earlier:

1. **Pre-mount GameScreen** — When `flowPhase.screen === 'baselineCaptured'`, also render GameScreen off-screen (opacity: 0 or position: absolute, left: -9999) so CameraView starts. When user taps PLAY, camera may already be ready.
2. **Lift camera to shared parent** — Keep one CameraView across screens. **Implemented:** `CameraProvider` mounts camera for baseline, baselineCaptured, gameLoading, game. Camera warms up under BaselineCapturedScreen’s image before PLAY tap.

---

## Possible next changes

If logs show `baselineImageUri` is set and `modalShouldShow` is true but the screen is still black, the Image likely fails to load in this context. Options:

1. **Normalize the URI** – ensure `file://` prefix on Android (use `file://` + path if missing)
2. **Don’t unmount the screen with the image** – add a `gameLoading` phase that shows the baseline image while GameScreen mounts and warms up off-screen
3. **Use base64 or expo-image** – pass a data URI or use a cached image so we don’t depend on file loading after navigation

---

## Console log

Add this in GameScreen after the destructuring line to inspect behavior:

```javascript
if (__DEV__) {
  console.log('[321FACE] GameScreen', {
    hasBaselineUri: !!baselineImageUri,
    uriPrefix: baselineImageUri?.slice(0, 60),
    cameraReady,
    modalCondition: !!(baselineImageUri && !cameraReady),
  });
}
```

When you tap PLAY, check Metro logs. That will tell us which of the failure points (A–E) is occurring.
