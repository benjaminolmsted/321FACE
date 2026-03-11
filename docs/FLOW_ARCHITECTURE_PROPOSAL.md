# Flow Architecture Proposal

A cleaner model for advancing through the app, defining what constitutes "one screen," and handling sequences driven by async work.

## Current Pain Points

1. **Advancement is scattered** — Navigation happens in useEffect (Baseline), `transition()` calls (Game), and callbacks. No single place defines "what leads to what."
2. **Async drives UI indirectly** — `processingPromiseRef`, `resultFlash.resultsReady`, and similar flags couple async completion to effects that then mutate state. Hard to trace the flow.
3. **"Screen" vs "phase" is blurred** — RN navigator has Home / Baseline / Game, but GameScreen internally has playing → processing → resultFlash → strike/debug/gameOver. These are conceptual phases, not screens.
4. **Timers + async interleave** — "Show 500ms then navigate" lives in effect logic that also awaits promises. The ordering (process first? timer first? both?) is implicit.

## Proposed: Phase-Based Flow Controller

### Core Idea

- **One source of truth:** `FlowPhase` — a discriminated union describing where we are.
- **One way to advance:** `advance(phase)` — the only function that changes phase.
- **Phases declare their conditions:** Each phase knows what must happen before we can leave (async work, min display time, user action).
- **Navigation and overlays derive from phase** — no separate "when to navigate" logic.

### Phase Definition

```ts
// What phase the app is in. Drives both navigation and in-screen overlays.
type FlowPhase =
  | { screen: 'home' }
  // Baseline "screen" has sub-phases; we stay on Baseline route for all of them
  | { screen: 'baseline'; phase: 'capture' | 'flash' | 'error'; data?: BaselinePhaseData }
  // Game "screen" has sub-phases
  | { screen: 'game'; phase: 'countdown' | 'playing' | 'processing' | 'resultFlash' | 'strike' | 'debug' | 'gameOver'; data?: GamePhaseData }
  ;

// Phase-specific payloads
type BaselinePhaseData =
  | { kind: 'flash'; displayUri: string; processing: Promise<BaselineProcessResult> }
  | { kind: 'error'; message: string; debugImageUri?: string }
  ;
```

### Flow Controller Hook

```ts
function useFlowController(initial: FlowPhase): [FlowPhase, (next: FlowPhase) => void] {
  const [phase, setPhase] = useState<FlowPhase>(initial);
  const advance = useCallback((next: FlowPhase) => {
    // Optional: run phase exit logic, persist for debugging
    setPhase(next);
  }, []);
  return [phase, advance];
}
```

The controller lives at app level (or in a provider) so `phase` is global. Navigation can derive from it:

```ts
// In App or a layout component
const [flowPhase, advance] = useFlowController({ screen: 'home' });

// Derive which RN screen to show
const currentRoute = flowPhase.screen === 'home' ? 'Home'
  : flowPhase.screen === 'baseline' ? 'Baseline'
  : 'Game';

// Navigator shows that route; pass advance + phase down
```

### Async-First Phase Transitions

Each phase that depends on async work uses a **phase handler** that:

1. Runs when we enter the phase
2. Starts async work and/or timers
3. When conditions are met, calls `advance(nextPhase)`

Example — Baseline flash:

```ts
// In BaselineCaptureScreen (or a useBaselineFlash hook)
useEffect(() => {
  if (flowPhase.screen !== 'baseline' || flowPhase.phase !== 'flash') return;
  const { displayUri, processing } = flowPhase.data;
  if (!displayUri || !processing) return;

  let cancelled = false;
  (async () => {
    const result = await processing;
    if (cancelled) return;
    if (!result.ok) {
      advance({ screen: 'baseline', phase: 'error', data: { kind: 'error', message: '...', debugImageUri: result.debugImageUri } });
      return;
    }
    await delay(BASELINE_FLASH_MS);
    if (cancelled) return;
    advance({ screen: 'game', phase: 'countdown', data: { gameParams } });
  })();
  return () => { cancelled = true; };
}, [flowPhase.screen, flowPhase.phase, flowPhase.data]);
```

The **capture** handler does sync work, advances to flash, and passes the processing promise:

```ts
const doCapture = async () => {
  const photo = await takePictureAsync();
  const { flippedPath } = await flipBaselineForDisplay(photo.uri);
  const processing = processBaselineFromTemp(flippedPath, photo.width);
  advance({
    screen: 'baseline',
    phase: 'flash',
    data: { kind: 'flash', displayUri: flippedPath, processing },
  });
};
```

So: **advance** is always explicit. Async work runs, and when it completes, the phase handler calls advance again.

### Timers as First-Class Conditions

For "show for 500ms then advance," the phase handler can use a helper:

```ts
await Promise.all([processing, delay(500)]);  // both must complete
// then advance
```

Or a small `whenReady` helper:

```ts
async function whenReady<T>(
  promise: Promise<T>,
  minDisplayMs: number
): Promise<T> {
  const [result] = await Promise.all([promise, delay(minDisplayMs)]);
  return result;
}
```

### Separation: Navigation vs Phase

| RN Navigator Screen | Flow Phase(s) |
|--------------------|--------------|
| Home               | `{ screen: 'home' }` |
| Baseline           | `{ screen: 'baseline', phase: 'capture' \| 'flash' \| 'error' }` |
| Game               | `{ screen: 'game', phase: 'countdown' \| 'playing' \| ... }` |

- **Navigate** when `flowPhase.screen` changes (or when entering Baseline/Game for the first time).
- **Overlay / sub-UI** when `flowPhase.phase` or `flowPhase.data` changes.
- One `flowPhase` drives both; no duplicate logic for "when to show Game."

### Transition Diagram (Explicit)

```
home
  └─ [Play] → baseline.capture

baseline.capture
  └─ [Capture] → baseline.flash { displayUri, processing }
  └─ [Back] → home

baseline.flash
  └─ [processing ok + 500ms] → game.countdown { gameParams }
  └─ [processing fail] → baseline.error

baseline.error
  └─ [Retry] → baseline.capture
  └─ [Back] → home

game.countdown
  └─ [onFace] → game.playing (triggers capture)
  └─ [Back] → baseline (or home)

game.playing
  └─ (countdown drives capture) → game.processing

game.processing
  └─ [done, strike] → game.resultFlash → game.strike
  └─ [done, pass] → game.resultFlash → game.countdown (next round)
  └─ [done, max strikes] → game.resultFlash → game.gameOver
```

## Implementation Options

### Option A: Minimal (Refactor in place)

- Introduce `FlowPhase` + `advance` at app level.
- Keep existing screens; have them receive `flowPhase` and `advance` via context or props.
- Replace scattered `setState` / `navigation.replace` with `advance(nextPhase)`.
- Phase handlers live in the screens as `useEffect` blocks keyed by `flowPhase`.

### Option B: XState

- Model phases as a state machine; async work as invoked services or delayed events.
- Transitions are declarative; XState handles running services and sending events when done.
- Heavier dependency; more powerful for complex branching and timeouts.

### Option C: Custom `usePhase` Hook

- Each "phase" (e.g. baseline flash) gets a hook: `useBaselineFlash(flowPhase, advance)`.
- Hook returns nothing; it only runs side effects and calls `advance` when ready.
- Screens stay thin; phase logic is isolated and testable.

## Recommended Path

1. **Introduce `FlowPhase` and `advance`** — Single source of truth for where we are.
2. **Lift flow state** — App (or a FlowProvider) owns it; pass down.
3. **Phase handlers** — One `useEffect` per phase that can transition out; each handles its own async + timer.
4. **Derive navigation** — `flowPhase.screen` → which Stack screen to show.
5. **Migrate incrementally** — Baseline first (simplest), then Game phases.

This gives you:

- **Clear definition**: "One screen" = one `flowPhase.screen` value; sub-states are `flowPhase.phase`.
- **Explicit advancement**: Only `advance()` changes phase.
- **Async-friendly**: Phase handlers await work, then call `advance` with the next phase.
- **Testable**: Transitions can be unit-tested by calling `advance` with different inputs.
