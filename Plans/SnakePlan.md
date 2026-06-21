# Snake HUD, Identity, And AI Status Plan

Part 1 starts by simplifying the existing DOM HUD in `Libraries/Game/snake/snakeHud.js` and the camera wiring in `Libraries/Game/snake/setupSnakeGame.js`. Remove the `Length` and `Best` panels entirely, including the `hudHighScoreStorageKey` dependency in `Config/games/snake.js` if nothing else uses it after the HUD change. Keep the food/hunger meter, but make the primary label the currently focused snake’s display name. Replace the current snake-vs-striker camera toggle with living-snake cycling: `Tab` and a visible `Switch Camera` button should both advance `focusedHeadId` through `state.sandbox.snakeGame.registry.aliveByHeadId`, skip dead or missing heads, call `setSandboxCameraTarget()` for the old and new heads, and update the HUD label immediately. The striker camera path can stay available only if there is still a real input path for it; otherwise it should not be carried as the primary HUD behavior.

Snake personalization should be introduced as a small generic identity layer rather than another snake-only random helper. Add a module under a reusable home such as `Libraries/AI/identity/agentIdentity.js` or `Libraries/Entities/entityIdentity.js` that can assign and read an identity object like `{ name, color }` by entity id or agent id. `spawnSnakeCavernScene()` in `Libraries/Game/snake/snakeScene.js` should assign each spawned snake a random name and color at the same point it currently chooses chain tint via `pickSnakeChainTintHex()`, then snake color should flow from identity into the existing tint application instead of parallel snake-only state. `setupSnakeGame.js` and `snakeHud.js` should consume identity through a small resolver, so switching camera focus says something like the snake’s name instead of generic `Snake`. This is intentionally just the beginning of personalization: stable naming and color first, with room later for traits, favorites, or history without changing snake game camera/HUD code again.

Part 2 should phase out `showSnakeFsmDebug` as a developer-facing string and replace it with user-facing AI status presentation. Today `snakeAutosim.js` exposes `getFsmSnapshot()` and `getFsmDebugLine()`, `snakeFsmDebugOverlays.js` formats jargon-heavy text, and `appendSnakeGameOverlayCommands.js` conditionally draws FSM rings/path overlays only when `showSnakeFsmDebug` is enabled. Keep `getFsmSnapshot()` as the raw diagnostic contract, but move interpretation into a generic AI UI adapter, for example `Libraries/AI/ui/agentStatusView.js`, that translates decision snapshots into readable states like `Hungry`, `Searching`, `Eating`, `Hunting`, `Scared`, `Stuck`, or `Cannot reach food`. Snake can provide a thin mapper from its `mode`, hunger state, threat state, route status, and sprint intent into that generic shape. The DOM HUD should render friendly status and meters; the canvas overlay should render optional status badges, destination/path indicators, and threat/food markers without exposing terms like FSM, candidate score, replan, or path length unless a separate developer debug toggle is explicitly enabled.

The canvas status layer should use the existing overlay-command pipeline first, not direct rendering from snake controllers. Add generic overlay command helpers under `Libraries/Render/overlays/` or `Libraries/AI/ui/` for agent status rings, compact badges, and meter glyphs, then have `appendSnakeGameOverlayCommands.js` pass focused snake status through those helpers. This replaces the tint-as-emotion approach from `snakeChainColor.js`: tint can remain identity/color, while feelings become explicit readable indicators above or around snakes. The UI should be comfortable and legible: short words, small meters, path and destination cues, and maybe subtle icons/colors, all toggleable so the simulation can be watched cleanly or with more context. Existing `showVisionCones`, `showAllSnakeVisionCones`, and `showMemoryHeatmap` can remain separate visualization toggles, but `showSnakeFsmDebug` should become either a deprecated internal debug flag or be replaced by `showAiStatusOverlay` plus a separate `showAiDebugDetails` if raw snapshot data is still useful.

Part 3 is the text-rendering/sidebar concern and should be planned as its own reusable rendering improvement. `Libraries/Render/FloatingText.js` already uses `SpriteCache` and `RenderSprites.floatingText`, but it is currently event-spawned, temporary, scheduler-driven text with simple lifetime motion. Expand this into a more general world text cache system that supports persistent labels and value readouts tied to world positions, with cache keys based on text, style, color, and quantized scale/zoom buckets. The persistent system should still reuse sprite baking rather than drawing raw canvas text every frame, and it should support both transient floating text and stable labels like snake names, status chips, hunger values, or short “stuck / hungry / hunting” indicators. The pathing/physics breakdown should remain a separate follow-up after Parts 1 and 2, but the new AI status UI should expose the symptoms clearly: when snakes are at minimum length, stuck in loops, failing routes, near food but not committing, or idling with reachable carcasses/shards nearby. That gives the later navigation/physics pass concrete user-facing evidence without letting pathfinding fixes block the HUD and identity work.

### PATHFINDING AND HYSTERESIS AND PICKUP PLAN

Q: "Okay don't change any code but can you also take a look at those pathfinding issues I mentioned? The snakes will get right nex to the food, then kinda path back and forth between one or two cells. Sometimes they'll do it in sync with other snakes that are just as confused about how to actually eat hte food. And then the other one is they'll get stuck in loops where they'll start down one path, then the system will replan and dcecide this is a better way so they'll turn around, and they're stuck in that loop until some physics thing in the environment like another snake literally knocks them out of it. Part of that can be fixed by that path threading thing I think, but the other part is just simple hysteresis and also homing in on a prop once it's in line of sight, I guess there needs to be a more precise switch to direct LOS. So show me three paragraph plan around that too"

A: "I’ll inspect the current snake navigation, path following, and arrival/LOS handoff code only, then give you a three-paragraph plan focused on the two oscillation modes you described.

The first fix should be the final-approach handoff, because the code already shows why snakes can sit next to food and oscillate. createCellTargetLocomotion().setSeek() always sets exactArrival: true and, for snake food/prey, lockOnTarget: true; then hasArrivedAtDest() deliberately returns false for locked targets, so the intent state never considers the destination “arrived,” while snakeAutosim.tick() only eats actual shard food when the head is within resolvedEatRadius. If the path follower keeps trying to satisfy cell/path steering even when the prop is already visible and near, it can bounce between one or two cells around the target. The plan here is to add a proper “terminal homing” state to cellTargetHpaNav: once a locked target is in direct line of sight and within a configurable handoff radius, stop following HPA path nodes and steer directly toward destWorld until the consume/impact radius triggers. This should use the existing LOS functions from gridCellVision or topology LOS, and it should be target-specific: shard food uses eat radius, intact carcass/prey uses strike/hunt radius. That gives snakes a precise last few feet behavior instead of treating food pickup as just another exact cell pathing problem.

The second fix is target/path hysteresis, because snakeIntentStates.js currently repicks a seek destination whenever target cell changes, target world changes inside the cell, destination is missing, or arrival is detected. For moving shards/carcasses/snakes and physics nudges, that can cause “target moved” churn and repeated HPA replans, especially if hpaGroundNavSession also triggers off-path or target-moved replans. Add a latch policy for seek targets: once a snake commits to a food/carcass/prey target, keep the same target id and current route for a minimum number of ticks or until a real invalidation happens, such as target dead/removed, target leaving vision plus memory expiry, route impossible for N frames, or a clearly better target beyond a score margin. Also add route-change hysteresis: do not accept a new route if it immediately reverses the snake’s current path/progress unless the new score is significantly better or the old route is actually stuck. This belongs mostly in the generic createAgentIntent/locomotion boundary or a small path-follow policy module, with snake providing thresholds; it should not become a one-off “if snake then don’t replan” branch.

The third fix is the longer path-threading/path-follow stability pass, separate from the final LOS handoff. The repeated “start down one path, replan, turn around, repeat until bumped” sounds like HPA path progress and local steering are not anchored strongly enough to the current corridor. cellTargetHpaNav.js calls driveGroundNav() every tick and lets hpaGroundNavSession request replans for epoch, sandbox, idle, and off-path reasons; without a corridor/thread commitment, small physics displacement can make a different route look better and flip direction. The plan is to introduce path threading or corridor commitment in the path follower: keep a current path segment/corridor id, advance monotonically along it, tolerate lateral physics drift within a corridor width, and only replan when the target changed meaningfully, the path is blocked, or progress has failed for a sustained window. Pair that with better status instrumentation from the HUD plan: expose “homing,” “following path,” “stuck,” “route changed,” and “near food” so you can tell whether a snake is failing because final homing did not engage, hysteresis rejected/accepted the wrong route, or the HPA route itself is bad."

##

---

name: Snake Nav Stabilization
overview: "Stabilize snake food pickup and route behavior in conservative increments: first make near-food pickup deterministic, then reduce replan churn, then consider deeper path-threading only if the remaining loop mode persists."
todos:

- id: phase-1-terminal-homing
  content: Add locked-target terminal LOS homing and debug phase reporting in the cell-target nav stack.
  status: pending
- id: phase-1-tests
  content: Cover near-target homing and blocked-LOS non-homing with targeted snake/cell nav tests.
  status: pending
- id: phase-2-target-hysteresis
  content: Latch same-target seek destinations and debounce small same-cell target movement before marking HPA target changes.
  status: pending
- id: phase-2-route-status
  content: Expose granular replan status and make route retry/failure meaningful for the snake decision model.
  status: pending
- id: phase-3-route-acceptance
  content: Add discretionary route replacement hysteresis and backwards-route rejection if replans still cause loops.
  status: pending
- id: phase-4-threading-decision
  content: Only design corridor/path threading after measuring the remaining failures from the first three phases.
  status: pending
  isProject: false

---

# Snake Nav Stabilization Plan

## Split Recommendation

Treat this as three implementations, not one large pathfinding rewrite. Start with terminal homing because it is the smallest change and directly targets the “right next to food but oscillating” bug. Then add target/replan hysteresis around existing route ownership. Only after those are verified should we touch path threading or corridor commitment, because that is broader and affects shared HPA behavior.

## Phase 1: Terminal LOS Homing

Implement a locked-target final approach in [`Libraries/Sandbox/groundNav/cellTargetHpaNav.js`](Libraries/Sandbox/groundNav/cellTargetHpaNav.js). Today `createCellTargetLocomotion().hasArrivedAtDest()` returns false for `lockOnTarget`, and `tick()` still calls `driveGroundNav()` before falling back to direct steering only when HPA has no steering. Add a `terminal_homing` phase for `lockOnTarget && exactArrival` when the head is within a derived handoff radius and has clear LOS to `destWorld` via [`Libraries/Spatial/query/lineOfSight.js`](Libraries/Spatial/query/lineOfSight.js). In that phase, skip HPA path steering/replans for the tick and steer directly with `steerRollToward()` until the existing consume/hit logic clears the destination.

Keep the surface small: add snake tuning under [`Config/games/snake.js`](Config/games/snake.js), likely `terminalHoming.enabled`, optional handoff radius, and a short hold duration so LOS flicker does not instantly drop back to HPA. Derive defaults from existing eat/arrival radii where possible rather than adding many knobs. Wire status through `getStatus()` and [`Libraries/Game/snake/createSnakeForageIntent.js`](Libraries/Game/snake/createSnakeForageIntent.js) so HUD/debug can show `navPhase: "hpa" | "terminal_homing" | "direct_locked" | "stranded"` plus `lastReplanReason`.

Targeted verification for this phase should stay narrow: extend [`tests/snakeNavArrival.test.js`](tests/snakeNavArrival.test.js) or [`tests/cellTargetHpaNav.test.js`](tests/cellTargetHpaNav.test.js) with a locked target near the head where an existing route would steer away, and assert terminal homing drives toward `destWorld` without requesting a new HPA route. Add one wall/LOS-negative case so homing does not activate through geometry.

## Phase 2: Target And Replan Hysteresis

Once terminal homing is in place, reduce route churn without changing the path planner. The first target is [`Libraries/Game/snake/snakeIntentStates.js`](Libraries/Game/snake/snakeIntentStates.js), where seek currently repicks whenever a locked target’s world position changes inside the same cell. Change that policy to hold the same target id and destination cell for a minimum tick window, updating sub-cell target world position only when movement exceeds a meaningful threshold or the target changes cell. This keeps prey/carcass/food nudges from becoming `targetChange` replans every tick.

Then add matching locomotion-level debounce in [`Libraries/Sandbox/groundNav/cellTargetHpaNav.js`](Libraries/Sandbox/groundNav/cellTargetHpaNav.js): `setDestination()` should avoid `markTargetChanged()` for same-cell, small world deltas. Preserve immediate invalidation for real target cell changes, missing targets, mode changes, topology epoch changes, and sustained no-route/stuck conditions. Also fix `needsRetry()` so route failure can actually flow into the decision model when a destination exists, no route is pending, and no route has been available for a sustained window.

Tests for this phase should focus on replan counts and state latching: add same-cell target nudge cases to [`tests/cellTargetHpaNav.test.js`](tests/cellTargetHpaNav.test.js), update [`tests/hpaGroundNavReplan.test.js`](tests/hpaGroundNavReplan.test.js) if policy thresholds move, and add a seek-state case in [`tests/snakeFsmTransitions.test.js`](tests/snakeFsmTransitions.test.js) proving the same target id is held instead of repicked on tiny world movement.

## Phase 3: Route Acceptance Hysteresis

If snakes still reverse repeatedly after Phases 1-2, add route-change hysteresis around HPA route acceptance rather than rewriting HPA. The likely boundary is [`Libraries/Sandbox/groundNav/hpaGroundNavSession.js`](Libraries/Sandbox/groundNav/hpaGroundNavSession.js) plus the path progress helpers in [`Libraries/Pathfinding/hpaPathSlot.js`](Libraries/Pathfinding/hpaPathSlot.js). Track the current route’s forward bearing/progress and reject discretionary replans whose first segment points mostly backward unless the reason is strong: `epoch`, target cell change, no route, or stuck beyond threshold.

Keep this generic and conservative. Add a sticky window after accepting a route so `offPath` or `targetMoved` cannot immediately replace it, while still allowing hard invalidations. Preserve monotonic progress where possible: when a replacement path is accepted, seed progress so it does not restart behind the current cell unless there is no safe forward match. This should reduce “start down a path, replan, turn around, repeat” without requiring full corridor threading.

Verification here should be policy/unit heavy. Extend [`tests/hpaPathSlot.test.js`](tests/hpaPathSlot.test.js) for progress seeding and reversal detection, and add a focused session test that feeds alternating candidate routes and asserts discretionary backwards replacements are rejected while hard invalidations still replan.

## Phase 4: Path Threading Only If Needed

Defer corridor/path threading until the smaller fixes are measured. If needed, extend `navSession` state with a committed segment/corridor concept and make [`Libraries/Pathfinding/hpaPathSlot.js`](Libraries/Pathfinding/hpaPathSlot.js) advance monotonically along that commitment while tolerating lateral physics drift. This is the larger implementation because it changes shared path-follow semantics, overlays, and likely worker/session assumptions.

The success criteria before taking this phase should be concrete: terminal homing engages near visible food, same-target replan counts are bounded, and remaining loops are demonstrably caused by route replacement rather than pickup handoff or target jitter. At that point, borrow ideas from the existing corridor pathfinding modules as reference, but do not directly wire that subsystem into snakes as part of the first pass.
