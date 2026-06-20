PR 1 — One vision build per head per sim tick
Each snake tick still runs syncSpatialBrain in perceive and then perceiveSnakeIntentWorld in transition, both touching resolveObserverGridVision / collectVisibleGridCells. The head-level \_observerVisionCache usually absorbs the second call, but that contract is implicit — flee repicks call perceiveWorld without a guaranteed preceding sync, and the cache keys off \_brainSyncTick instead of snakeGame.simTick. This PR stamps vision against the shared sim tick, routes goal lookup (snakeGoals.js) and threat LOS (snakeIntent.js) through that result, and extends snakePerfBudget.test.js with a counter on full cone builds asserting ≤ alive snakes × ticks over the 50-head / 120-tick run. Pure logic-side win; no new modules.

PR 3 — Replan throttle on the shared HPA session
HpaPathSession already coalesces per-navState and queues when in-flight work hits MAX*HPA_REPLAN_SLOTS, but 50 independent cellTargetHpaNav sessions can still stampede requestReplan in the same frame — the perf test allows 2000 requests with a mock worker that resolves instantly, which hides main-thread drain from real worker churn. Add a per-frame global budget on newly started replans, using existing replanPriorityFor / REPLAN_PRIORITY*\* so on-screen heads win and off-screen stuck/idle requests defer; optionally tighten the effective in-flight cap for snake autosim so the wait queue drains steadily instead of spawning dozens of concurrent drains. snakePerfBudget keeps wall-clock and total-request ceilings; add an assertion that peak in-flight replans stay under the new cap.

PR 4 — Render and physics hot paths (profiler-driven)
The trace points at main-thread canvas work and constraint solving, not AI — drawImage (~345 ms), clip (~165 ms), and drawImageTriangle (~76 ms) inside renderSimulationScene / draw3DBuildings, plus solveDistanceConstraintVelocity (~84 ms) and wall resolution (resolveBodyAgainstWallSegments) on every frame. This PR stays inside existing pipelines: render — harden viewport-tier culling so off-screen snake chains and segments skip the prop blit path (queryPropsInView / blitAnchoredSprite), verify wall-atlas and QuantizedSpriteCache hits aren't thrashing LruMap evictions from bad cache keys or per-frame invalidation, and cut redundant clip saves in the structure pass where the visible set hasn't changed; physics — sleep or island-deactivate fully off-screen snake chains so distance constraints and wall broadphase (kineticSpatial → WallCollisionResolver) don't run at full cost for 49 heads the camera isn't showing; defaults — flip snake debug overlays off (showVisionCones, memory heatmap) so overlay clip/fill work doesn't stack on top of the sim draw path. Measured with the same Chrome profiler scenario before/after; snakePerfBudget wall-clock ceiling should drop without touching gameplay rules.

## PR 1

Exposed issues with FSM + vision.

## PR 1A + 1B

PR 1A — Per-frame perception context (structural)
Introduce a single observer vision frame owned by the snake perception tick, created in beginSnakePerceptionFrame / beginGridVisionTick and hung off state.navigation (or snakeGame if you want it snake-scoped). The frame holds what every callsite currently re-assembles by hand: simTick, gridNavContext, gridCellVisionSession, visionCone, viewport policy (onScreen resolution + brainSyncOffScreenInterval), and helpers ensureHeadVision(head) / readHeadVision(head). createSpatialBrainSync drops ensurePerceptionTick and resolvePerceptionTick — sync just calls frame.ensureHeadVision(agent) and stamps vision.cells into the brain. findNearestVisibleSnakeGoal, findNearestVisibleThreat, and tests stop spreading { ...viewSync, perceptionTick, brainSyncTick }; they take (state, seeker) and read through the frame. The existing \_observerVisionCache + perceptionTick stamp stays on the head; the frame is the wiring layer, not a second cache. snakePerfBudget vision-build assert stays green; add one test that two reads in the same frame after one ensure still count as one full build.

POST MORTEM:

PR 1 is done. Here's what landed:

observerVisionFrame.js (new)
Per-sim-tick frame holding tickId, gridNavContext, visionSession, visionCone, viewport policy, plus readHeadVision(observer) / ensureHeadVision(observer) — no more spread opts at call sites.

snakePerception.js
beginSnakePerceptionTick creates the frame via refreshObserverVisionFrame alongside beginGridVisionTick. ensureSnakeObserverVision is now a one-liner through the frame.

syncSpatialBrain.js
Dropped ensurePerceptionTick and resolvePerceptionTick. Sync uses getObserverVisionFrame(state).ensureHeadVision(agent, visionCone).

snakeGoals.js / snakeIntent.js
Goal and threat queries use frame.readHeadVision(seeker, visionCone) instead of hand-assembling cache opts.

snakeAutosim.js
createSnakeBrain no longer injects perception callbacks
runSnakeFsmTick owns tick framing: maybeBeginSnakeAutosimTick when not batching, ensureSnakePerceptionTick when batching — so start() and the perf harness both have a frame before sync runs
Tests
New frame unit test in gridCellVision.test.js
FSM tests that call intent.perceive directly now call beginSnakePerceptionFrame first
All 39 targeted tests pass, including the perf budget vision-build ceiling. PR 2 can trim the remaining low-level exports (readObserverGridVision at call sites, etc.) without touching behavior.

PR 1B — Clarity pass: collapse signatures and delete duplicate wiring
Once the frame exists, do a readability-only pass on the vision/brain surface — no behavior changes. Collapse ensureObserverGridVision / readObserverGridVision / resolveObserverViewSyncContext into a small internal module (e.g. observerVisionFrame.js colocated with gridCellVision.js) with one exported frame factory and thin read/ensure methods; keep resolveObserverGridVision as a test/debug escape hatch or delete it if nothing needs the raw opts bag. Remove ensureSnakeObserverVision as a public API — tests call beginSnakePerceptionFrame + frame.ensureHeadVision(seeker) instead of a snake-specific shim. Trim createSpatialBrainSync back to { brain, visionCone, brainSyncOffScreenInterval, navMemoryStepPenalty, navMemoryStepFalloff, visionFrame } (or pass the frame resolver once at snake wiring time in createSnakeBrain). Inline or delete the \_brainSyncTick vs simTick split where the frame makes it redundant, rename anything left so “tick” unambiguously means sim tick unless it’s explicitly head brain cadence. Goal: any new perception query is “get frame, read head vision, scan candidates” — three lines, no spread opts.

POST MORTEM:

observerVisionFrame.js — now owns the full vision pipeline
Cache lookup, cone build, perf counter, viewport sync, queryGridCellVision, and the frame API all live here. Public surface:

createObserverVisionFrame / getObserverVisionFrame
frame.shouldSyncBrain(agent) — replaces manual viewSyncFor + \_brainSyncTick math
frame.readHeadVision / frame.ensureHeadVision
queryGridCellVision (moved from gridCellVision.js)
resetVisionFullBuildCount / getVisionFullBuildCount
gridCellVision.js — geometry/LOS only
Cone math, LOS, and collectVisibleGridCells. Removed: readObserverGridVision, ensureObserverGridVision, resolveObserverGridVision, resolveObserverViewSyncContext, and the build counter.

syncSpatialBrain.js
Down to { visionCone, navMemoryStepPenalty, navMemoryStepFalloff }. Sync is now:

if (frame.shouldSyncBrain(agent)) frame.ensureHeadVision(agent, visionCone)
Naming
\_brainSyncTick → \_brainSyncPass (off-screen brain cadence, separate from sim tick)
Dropped brainSyncTick from cache lookup opts — frame uses tickId only
Removed shims
Deleted ensureSnakeObserverVision
Tests use primeSnakeHeadVision(state, seeker) in the harness (beginSnakePerceptionFrame + frame.ensureHeadVision)

## PR 1 cleanup ✅

- `requireSnakeVisionFrame(state)` — single entry for tick + frame
- `perceiveSnakeIntentWorld` — one `readHeadVision`, shared threat + food scan
- `findNearestVisibleSnakeGoalFromVision` — reused by autosim pinned-goal path (no double goal query)
- `pickFleeCell` — ideal away cell only; null when blocked (no map/ring fallback)
- Debug defaults off: `showVisionCones`, `showMemoryHeatmap` in `Config/games/snake.js`
- Vision overlays already gated by `showVisionCones` in `appendSnakeGameOverlayCommands`

## PR 3 — Replan throttle on the shared HPA session

`HpaPathSession` already coalesces per-`navState` and queues when in-flight work hits `MAX_HPA_REPLAN_SLOTS`, but 50 independent `cellTargetHpaNav` sessions can still stampede `requestReplan` in the same frame — the perf test allows 2000 requests with a mock worker that resolves instantly, which hides main-thread drain from real worker churn. Add a per-frame global budget on newly started replans, using existing `replanPriorityFor` / `REPLAN_PRIORITY_*` so on-screen heads win and off-screen stuck/idle requests defer; optionally tighten the effective in-flight cap for snake autosim so the wait queue drains steadily instead of spawning dozens of concurrent drains. `snakePerfBudget` keeps wall-clock and total-request ceilings; add an assertion that peak in-flight replans stay under the new cap.

## PR 4 — Off-screen sim cost (was render/physics junk drawer)

Split the old PR 4 into two focused wins instead of one profiler grab-bag:

**PR 4a — Off-screen snake chain sleep:** viewport-tier check on each chain; sleep/island-deactivate heads+segments fully off-screen so `solveDistanceConstraintVelocity` and wall broadphase skip ~49 of 50 snakes when camera follows one head.

**PR 4b — Render cull hardening:** prop blit path only for `queryPropsInView` hits; audit wall-atlas / `QuantizedSpriteCache` eviction (no new pipeline). Measure with Chrome profiler; separate from AI work.

Old PR 4 "defaults off" and vision overlay gating — done in cleanup.
