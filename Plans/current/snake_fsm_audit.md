# Snake Game + FSM AI Codebase Audit

This audit evaluates the current state of the Snake Game and FSM AI implementation against the established architectural hygiene guidelines, object allocation rules, and parameter-threading constraints.

---

## 1. Roadmap & Task Status Dashboard

Here is a consolidated view of where the codebase currently stands across the active plan files.

### 📋 AI & FSM Roadmap (`Plans/current/fsmroadmap.md`)
*   **Part 1: Tighten Flow Reach Semantics** — **~90% Complete**
    *   ✅ **1.1 & 1.2:** Audit first-frame behavior, committed route length precedence, and add targeted flow reach tests.
    *   ✅ **1.4:** Delete obsolete `navReachHorizon.js` and its tests.
    *   ⬜ **1.3 (Pending):** Add lightweight diagnostics to FSM snapshots to explain reach source (`route`, `flow`, `stale`, `unknown`) if needed.
*   **Part 2: Wire Flow Locomotion into Agent Intent** — **⬜ Pending**
    *   We have not started wiring flow flee steering downhill yet. Flee agents still use HPA pathfinding (`cellTargetHpaNav.js`).
*   **Part 3: Scale the Flow Worker Path** — **⬜ Pending**
    *   Worker slot profiling, prioritizations, and lifecycle error visibility have not yet been evaluated.
*   **Part 4: Continue FSM Hygiene** — **🟡 Scaffolding / In-Progress**
    *   Kept states in `intentStates.js`, but significant opportunity remains to reduce parameter threading.

### 📋 Hygiene & Passthrough (`Plans/current/hygiene.md` & `passthrough.md`)
*   **Tier 0 (Viewport, Draw Input, ElevationCamera, setPropCatalog)** — **✅ Fully Complete**
    *   No occurrences of `worldSceneDrawInput`, `ElevationCamera`, or obsolete draw syncs remain in the codebase.
*   **Tier 1 (Prop Definitions & Game Launcher)** — **🟡 In-Progress**
    *   ✅ P3-3: Duplicate prop definitions map (`getWorldPropDefinitions`) has been deleted.
    *   ⬜ P4-1: `getGameLauncher` remains as a wrapper getter over static `GAME_LAUNCHERS` in [gameLaunchers.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Game/gameLaunchers.js).
*   **Tier 1b (AI Distance Passthrough & Blackboard/Snapshot collapsion)** — **✅ Fully Complete**
    *   Obsolete `blackboard` and `decisionSnapshot` classes/fields have been completely purged from production and test files.
*   **Tier 3 (Sandbox/Editor Param Threading)** — **⬜ Pending**
    *   `resolveSandboxBehaviors` still threads `registeredBehaviors` through inspectors/controller.
    *   `SimulationEffectPass.draw` still threads the whole `renderer` to reach `render3D.drawFloorProps`.

### 📋 Library Defaults (`Plans/current/library_defaults.md`)
*   **LD-1 & LD-2 (Collision & Physics defaults in Libraries)** — **⬜ Pending**
    *   [collisionDefaults.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Collision/collisionDefaults.js) and [physicsDefaults.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Motion/physicsDefaults.js) still house `LIBRARY_COLLISION_DEFAULTS` and `LIBRARY_PHYSICS_DEFAULTS`, which are merged at boot in `engineGlobals.js`.
*   **LD-3 & LD-4 (Prop Render & Pixel Defaults)** — **⬜ Pending**
    *   Still defined inside Libraries; need to migrate to `Core/GamePropRender.js` and `Core/GamePropPixelSize.js`.

---

## 2. Hot-Path Allocations (GC Smells)

A major priority in `objects.md` is eliminating per-tick allocations on the hot simulation loop. While the state context frame is flat and mutated in place, several areas still spawn ephemeral objects or closures every frame:

### A. Vision Classification Allocates Objects & Centroids
*   **Location:** [classifyAgentVision.js:L61](file:///c:/Users/mrjbl/Desktop/tower/Libraries/AI/perception/classifyAgentVision.js#L61)
*   **Smell:** On every FSM tick, for every active agent, `classifyAgentVision` returns a new object literal:
    ```javascript
    return { threat, prey, ally, threatCount, allyCount, allyCentroid: allyCount > 0 ? { x: allyCentroidX / allyCount, y: allyCentroidY / allyCount } : null };
    ```
    This creates a fresh wrapper object and a fresh nested `allyCentroid` coordinates object.
*   **Fix:** Accept an out-parameter `out` or write directly into the pre-allocated FSM context frame.

### B. Perception Options Create Closures Per-Tick
*   **Location:** [agentIntentPerception.js:L8-L12](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Game/snake/agentIntentPerception.js#L8-L12)
*   **Smell:**
    ```javascript
    return {
        readVisionFrame: requireSnakeVisionFrame,
        agentRange: shared.fleeRange ?? resolved.range,
        resolveRelationship: (selfInstance, targetInstance, _gameState, distSq) => resolveRelationshipForInstances(selfInstance, targetInstance, undefined, distSq),
    };
    ```
    Every perception call creates a new options object and a fresh arrow function closure for `resolveRelationship`.
*   **Fix:** Cache this configuration statically or attach a reusable options reference to the agent profile instance.

### C. Decision Context Pipeline Allocates Wrapper Input
*   **Location:** [groundNavIntentProfiles.js:L58-L67](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Game/snake/groundNavIntentProfiles.js#L58-L67)
*   **Smell:** `buildDecisionContextInto` builds a fresh `decisionInput` literal on every tick:
    ```javascript
    const decisionInput = {
        visibleWorld: visible,
        memoryWorld,
        memorySource: memoryWorld.memorySource,
        committedTarget: committed,
        routeStatus,
        reachSteps,
        cellSize: state.obstacleGrid.cellSize,
        foodFraction: resolveHunger ? resolveHunger() : null,
    };
    ```
*   **Location:** [buildAgentDecisionContext.js:L115](file:///c:/Users/mrjbl/Desktop/tower/Libraries/AI/agents/buildAgentDecisionContext.js#L115)
*   **Smell:** `buildAgentDecisionContextInto` uses object spread to copy the input:
    ```javascript
    buildAgentDecisionFrameInto(ctx, spec, { ...input, foodFraction, hungerTier });
    ```
    This clones the wrapper object.
*   **Fix:** Since `decisionContext` is flat and pre-allocated, write these fields directly onto the context in the adapter, eliminating the middleman `decisionInput` object.

### D. Mode-Scoring Details Allocate Object Container
*   **Location:** [scoreDecisionModes.js:L115-L116](file:///c:/Users/mrjbl/Desktop/tower/Libraries/AI/agents/scoreDecisionModes.js#L115-L116)
*   **Smell:** `scoreDecisionCandidateDetails` creates `const details = {};` every tick.
*   **Fix:** Write the details directly into a pre-allocated structure on the context frame (e.g., `ctx.candidateScoreDetails`), using static keys.

---

## 3. Parameter-Threading & Passthrough Smells

### A. Deep Decision Context Pipeline Forwarding
*   **Smell:** Unpacking and repackaging the same variables down 6 function layers:
    ```text
    createGroundNavIntentAdapter (perceiveWithMemory)
      → buildDecisionContext (callback)
        → buildDecisionContextInto (groundNavIntentProfiles)
          → buildAgentDecisionContextIntoFor (gameDecisionContext)
            → buildAgentDecisionContextInto (buildAgentDecisionContext)
              → buildAgentDecisionFrameInto
                → mergeSlotsFromSchemaInto (mergeSlotsFromSchema)
    ```
    These layers exist primarily to transfer data the caller already has to the callee.
*   **Fix:** Flatten this flow. Let the FSM adapter write directly to the `decisionContext` properties or call a single, flattened builder function.

### B. Simulation Effect Pass Renderer Threading
*   **Location:** [Render.js:L66](file:///c:/Users/mrjbl/Desktop/tower/Render/Render.js#L66) and [floorProps.js:L43](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Sandbox/floorProps.js#L43)
*   **Smell:** `pass.draw(state, viewport, this.ctx, this)` passes the whole `renderer` to the simulation effect pass just to execute `renderer.render3D.drawFloorProps`. This makes the simulation pass depend heavily on the renderer interface.
*   **Fix:** Let the draw pipeline invoke the `drawFloorProps` method directly inside `composeFrame` or `buildSimulationPipeline`, or import the draw entry point instead of routing it through a passed handle.

---

## 4. Big Opportunities to Improve Clarity

1.  **Flatten and Direct-Write the FSM Decision Context:**
    Currently, the FSM adapter gathers the facts (`visible`, `routeStatus`, `committed`, `reachSteps`), packs them into a wrapper object, threads them down 6 layers, where they are finally copied onto the flat `decisionContext`.
    *Refactoring this to write variables directly onto the pre-allocated `decisionContext` would eliminate hundreds of lines of passthrough plumbing, avoid 3 object allocations per tick, and make it obvious where each fact comes from.*

2.  **Eliminate the Per-Tick Perception Allocations:**
    Updating `classifyAgentVision` to accept a scratch/out object for the return slots, and caching the options/relationship closures on the species profile, will clean up the hot path for vision processing.

3.  **Perform the Library Defaults Cleanup (LD-1 & LD-2):**
    Moving `collisionDefaults.js` and `physicsDefaults.js` into `Core/GameCollision.js` and `Core/GamePhysics.js` removes the inverted dependency where lower-level math libraries hold the default settings for the entire game.

4.  **Consolidate and Clean Up Tests (`stupidtests.md`):**
    Trimming `snakeFsmTransitions.test.js` down from 590 lines (cutting overlapping integration tests) and promoting key unit tests to Tier 1 will speed up development feedback loops.
