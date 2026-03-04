# Game State Flow – Current (Buggy) Strategy

## State Variables (Fragmented)

- `gameState`: 'playing' | 'processing' | 'debug' | 'strike' | 'gameOver'
- `roundIndex` / `roundIndexRef`: current round (1+ in play mode)
- `strikes` / `strikesRef`: strike count
- `strikeHistory`: details for game-over screen
- `captureData`: for debug/strike overlays
- `phase` (from useCountdown3251): countdown phase 0-3 or null
- `baselineLandmarks`, `overlaySize`: UI-only

## Problems

### 1. **Auto-capture from error retry**
When `captureAndProcess` fails (no face, exception), it calls:
```js
start({ onFace: () => captureAndProcess(true) })
```
This starts a countdown and fires `captureAndProcess` again 1.25s later **without a user tap**.
Result: a retry loop that feels like “auto capture”.

### 2. **Auto-capture after strike/pass**
After a strike or pass, we call:
```js
start({ onFace: () => captureAndProcess(true) })
```
So the next capture is triggered by the previous one, not the user.
Desired behavior: every capture (including retries) should be initiated by a button press.

### 3. **Two capture entry points**
- Button: `playMode ? start({ onFace: ... }) : captureAndProcess()`
- Countdown `onFace`: `captureAndProcess(true)`

So the flow depends on both the button and the hook. That coupling makes it easy for captures to run without the user pressing the button.

### 4. **No clear “idle vs ready-to-capture” distinction**
During countdown or after processing, we hide the button (`phase !== null`), but we still rely on `start()` to drive the next capture. That keeps the auto-retry behavior in place.

## Correct Flow (Target)

1. **Idle**: User sees camera + capture button. No countdown, no processing.
2. **User taps** → start countdown (3..2..1.FACE).
3. **On FACE** → capture, process.
4. **After result**:
   - Strike: increment, show same view, but stay **idle**. User must tap again.
   - Pass: save face, advance round, stay **idle**. User must tap again.
   - Game over: show game-over screen.
   - No face / error: stay **idle**. User must tap again.

## Fix

- Remove all `start({ onFace: ... })` calls from inside `captureAndProcess`.
- After any result (pass, strike, no-face, error), only:
  - Update state (round, strikes, game over)
  - Set `gameState` back to `'playing'`
- Do **not** call `start()` anywhere except from the capture button’s `onPress`.
- Every capture (including retries) begins with a user tap.
