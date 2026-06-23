# Snake vision — decouple from viewport

One page. Goal: **snake combat vision and the focused-agent debug overlay never depend on the camera viewport** — pan, zoom, and Tab must not change what agents see or corrupt sim perception.

**Out of scope:** `drawLosShadowOverlay` / LOS shadow darkness in `preview.js` — that is a separate engine render feature, not snake vision. Do not touch it in this work.

Binding: [`frame.md`](frame.md) · [`hygiene.md`](hygiene.md) · [`fsmroadmap.md`](fsmroadmap.md)

---

## What is broken

Two mistakes in the snake vision path:

1. **Combat vision cache reads viewport** — `lookupHeadVisionCache` in `observerVisionFrame.js` uses `onScreen` from `viewport.circleInBounds`. Off-screen agents reuse stale vision across ticks; panning flips on/off-screen and cascades wrong threat/prey/food for the whole population.
2. **Debug overlay re-enters sim** — `focusedAgentVisionOverlays.js` calls `requireSnakeVisionFrame` → `ensureHeadVision` → `perceiveAgentIntentWorld` during **render**. That advances perception state outside the tick batch and poisons the same agent caches the FSM uses on the next tick — flicker, wrong rings, agents freezing or mis-targeting.

**Actor LOS itself is fine.** `classifyAgentVision` already does registry loop + per-head `hasGridCellLineOfSightCached`. No cell flood required for combat.

---

## Design rule (non-negotiable)

| Concern | May use viewport? | Runs when? |
|--------|-------------------|------------|
| Combat vision (threat / prey / ally / food) | **No** | Sim tick batch only |
| Spatial brain stamp (`stampSeenCells`) | **Yes** — throttle off-screen brain sync | Sim tick, via `shouldSyncBrain` only |
| Focused-agent debug overlay (cells + rings) | **No** | Draw pass, read-only, no sim imports |

Viewport gates **brain work**, not **eyes**.

---

## The plan (do in order)

### Step 1 — Strip viewport out of combat vision cache

**File:** `Libraries/Navigation/perception/observerVisionFrame.js`

- Delete `onScreen` and `brainSyncOffScreenInterval` from `lookupHeadVisionCache` and `headVisionLookupFor`.
- Cache key = head pose + nav topology key + range + `perceptionTick` only. Include `gridNavCacheKey(grid)` (not bare `wallRevision`).
- Remove cross-tick reuse: delete line 26 (`if (!onScreen && …) return cache`). Stale off-screen vision was the pan/zoom cascade.
- Keep `resolveObserverViewportSync` **only** inside `shouldSyncBrain` — spatial memory throttle stays viewport-aware; combat vision does not.

**Accept:** `readHeadVision` / `ensureHeadVision` behave identically whether the camera is on the agent or not.

---

### Step 2 — Decouple focused-agent debug overlay from sim perception ✅

**File:** `Libraries/Game/snake/focusedAgentVisionOverlays.js`

Remove entirely:

- `requireSnakeVisionFrame`
- `perceiveAgentIntentWorld` / `perceiveFocusedAgentWorld`
- `frame.ensureHeadVision` on the sim frame

Replace with read-only draw path:

```text
Agent rings  → classifyVisibleAgentsFromVision(head, headId, state, registry, frameStub, null, opts)
Cell highlight → collectVisibleGridCells(navTopology, head.x, head.y, range, overlaySession)
```

- `frameStub`: `{ navTopology: state.nav.topology, visionSession: null, visionRange }` — no tick, no cache writes.
- `vision: null` for rings — `classifyAgentVision` uses origin from seeker + per-target grid LOS.
- Cell flood: local `createGridCellVisionSession()` per draw (or module scratch); **never** write `observer._observerVisionCache`.

Optional helper (keeps overlay dumb):

**New:** `Libraries/Navigation/perception/overlayHeadVision.js`

- `buildOverlayHeadVision(head, navTopology, visionRange)` — returns `{ cells }` only; no agent cache, no sim `visionFullBuildCount`.

**Accept:** calling overlay twice in one frame does not change sim tick id, agent cache, or FSM perception results.

---

### Step 3 — Sim tick hygiene

**Files:**

- `Libraries/Game/snake/setupSnakeGame.js` — wrap `_batchingPerception` in `try/finally` so a thrown tick cannot leave batching stuck.
- `Libraries/AI/perception/agentWorldPerception.js` — `readHeadVision`; if null, `ensureHeadVision` (one build per agent per tick, no double build when sync ran first).

Food path (`snakeFood.js`) — same read-then-ensure pattern, or per-shard LOS like actors (no cell set required if acceptable perf).

---

### Step 4 — Tests + manual checklist

**Run:**

```text
node scripts/run-tests.mjs tests/focusedAgentDebugOverlays.test.js tests/gridCellVision.test.js tests/snakeFsmTransitions.test.js tests/snakeIntent.test.js tests/snakePerfBudget.test.js
```

**Update:**

- `focusedAgentDebugOverlays.test.js` — overlay rebuilds per draw without touching sim cache (expect overlay build count to increment on second draw, sim count unchanged).
- `snakePerfBudget.test.js` — reset vision build counter after session setup if start() primes vision before measured loop.

**Manual (must pass before ship):**

- [ ] 64 snakes + squids running — no vision overlay flicker
- [ ] Tab focus — rings/cells stay on new head; sim keeps hunting/fleeing correctly
- [ ] Pan + zoom — debug cells/rings stay on focused head; **sim threat/prey unchanged** by camera move
- [ ] Wall damage during combat — threat/prey updates without viewport change
- [ ] Off-screen agents (drag camera away) — still flee/fight when threat closes (no stale vision reuse)

---

## Do not do

- Do **not** touch `losShadowOverlay.js` or `preview.js` shadow pass — not snake vision.
- Do **not** wire flow fields into vision — reach ≠ line of sight.
- Do **not** add viewport keys to vision cache or invalidate-on-pan hooks — remove viewport from vision, full stop.
- Do **not** call `requireSnakeVisionFrame` or `perceiveAgentIntentWorld` from any draw/overlay path.
- Do **not** stack a second cache layer to paper over overlay re-entry — fix the re-entry.

---

## Files touched (summary)

| File | Change |
|------|--------|
| `observerVisionFrame.js` | Viewport out of cache; nav key in cache; no cross-tick off-screen reuse |
| `focusedAgentVisionOverlays.js` | Read-only classify + local cell flood |
| `overlayHeadVision.js` | New optional helper for draw-only cell flood |
| `setupSnakeGame.js` | `try/finally` on batching flag |
| `agentWorldPerception.js` | read → ensure fallback |
| `snakeFood.js` | read → ensure fallback (or per-shard LOS) |
| `tests/focusedAgentDebugOverlays.test.js` | Overlay isolation expectations |

---

## Done when

Snake FSM threat/prey/ally/food results are identical whether the focused agent is centered, off-screen, or the camera is panned/zoomed — and the focused-agent debug overlay never mutates sim perception state.
