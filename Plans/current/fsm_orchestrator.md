---
name: AI Frame Orchestrator (Final)
overview: "Introduce a strictly config-driven AI frame orchestrator. Unifies the FSM tick rate to budget main-thread CPU while maintaining path-following and physics. Fully respects hygiene.md: removes obsolete brainSync intervals, enforces zero test shims, and keeps tests aligned with production code."
todos:
    - id: config-update
      content: Add aiBudget to snake config and remove brainSyncOffScreenInterval
      status: pending
    - id: remove-obsolete-brain-sync
      content: "Prune observerVisionFrame.js & syncSpatialBrain.js: remove shouldSyncBrain and unconditionally stamp when called"
      status: pending
    - id: create-orchestrator
      content: Create agentFrameOrchestrator.js with beginFrame/shouldThink/endFrame and priority tier checks
      status: pending
    - id: wire-orchestrator
      content: Wire orchestrator into snakeAgentSession.js tickAliveAgents loop
      status: pending
    - id: split-autosim
      content: "Split agentAutosim.js logic: branch perceive+decide on 'admitted', but always run locomotion and metabolism"
      status: pending
    - id: clean-tests
      content: Clean up all touched tests (snakePerfBudget, etc.), removing obsolete shapes and test-only exports to comply with hygiene.md
      status: pending
isProject: false
---

# Unified AI Frame Orchestrator

## Recommendation & Scope

We will implement a unified **AI Frame Orchestrator** to throttle perception and FSM transitions without freezing locomotion or physics.

We will ensure the entire system is strictly **config-driven**, removing old scattered intervals (like `brainSyncOffScreenInterval`).

Every file touched will be audited against `hygiene.md`: obsolete code will be deleted, and we will ruthlessly prune any code that exists solely to support tests or backwards compatibility.

---

## 1. Unified Budget Config

The orchestrator will be entirely driven by `SNAKE_GAME_DEFAULTS` in `Config/games/snake.js`. Hardcoded intervals will be removed.

```javascript
    aiBudget: {
        thinkPerFrame: 32,
        focusedThinkEveryFrame: true,
        onScreenThinkInterval: 1,
        offScreenThinkInterval: 4,
        dormantThinkInterval: 30, // Far off-map or inactive
    },
```

### Removing Obsolete Config

- Delete `brainSyncOffScreenInterval` from config and session options. The orchestrator will now govern when an agent "thinks" (which includes brain syncing).

---

## 2. Core Orchestrator Design

Create a domain-owned scheduler in `Libraries/Game/snake/agentFrameOrchestrator.js`.

- Expose a simple API: `createAgentFrameOrchestrator(config)`
- It tracks the frame id, a round-robin cursor, and the number of thinks used this frame.
- It provides a `shouldThink(instance, state, viewport)` method that uses `aiBudget` and the agent's screen visibility to determine if it is admitted this frame.

**Priority Tiers (Cheap checks only):**

1. **Focused:** Target of the follow camera -> runs every frame if `focusedThinkEveryFrame` is true.
2. **On-Screen:** `viewport.circleInBounds(head.x, head.y, radius, "props")` -> runs according to `onScreenThinkInterval` (usually 1).
3. **Off-Screen:** Not visible -> runs according to `offScreenThinkInterval`.
4. **Budget Gate:** After intervals are met, cap total expensive updates using `thinkPerFrame`.

---

## 3. FSM & Autosim Contract

The generic FSM host (`createAgentIntent`) remains untouched, functioning as a pure intent machine. The orchestrator limits _when_ we call it.

In `Libraries/Game/snake/agentAutosim.js`, split `think` from `locomotion`/`metabolism`:

- Update `autosim.tick(dtMs, admitted)` to accept the admission flag.
- **If `admitted`:**
    - Call `intent.tick` (perceives the world, evaluates utility, runs transitions).
    - Update `sprintState`.
- **Always:**
    - Run `headNav.tick` (HPA locomotion continues following the existing path).
    - Run `metabolismApi.tick` (hunger drains seamlessly).
    - Run physics validation / eat checks (so off-screen agents don't phase through food).

---

## 4. Deleting Obsolete Code & Test Shims (hygiene.md compliance)

Because the orchestrator controls the think interval entirely, we must remove the now-redundant throttling in the perception/vision layers.

1. **Delete obsolete brain sync logic:**
    - In `Libraries/Navigation/perception/observerVisionFrame.js`, delete `shouldSyncBrain`, `resolveObserverViewportSync`, and the `brainSyncOffScreenInterval` parameter.
    - In `Libraries/AI/brain/syncSpatialBrain.js`, remove the `if (frame.shouldSyncBrain(agent))` guard. Unconditionally run `ensureHeadVision` and `stampSeenCells` inside the sync function, since the caller (`perceive`) is now throttled.

2. **Clean up tests (`hygiene.md` enforcement):**
    - Update `tests/snakePerfBudget.test.js` to configure `aiBudget.offScreenThinkInterval` instead of `brainSyncOffScreenInterval`.
    - Remove any deprecated mocks or assertions that checked the old `shouldSyncBrain` output.
    - Ensure the test suite properly accounts for `aiBudget.thinkPerFrame` ceilings.
    - Sweep `setupSnakeGame.js`, `snakeAgentSession.js`, and `agentAutosim.js` to ensure no "test-only" exports or wrapper objects are hanging around. Production code should only export what production uses.

---

## 5. Wiring the Orchestrator

1. **`snakeAgentSession.js`**:
    - Initialize `session.orchestrator = createAgentFrameOrchestrator(getSnakeGameConfig().aiBudget)`.
    - In `tickAliveAgents`, orchestrate the loop:
        ```javascript
        session.orchestrator.beginFrame(state.sandbox.snakeGame.simTick);
        for (const instance of aliveAgentInstances(session.registry)) {
            const admitted = session.orchestrator.shouldThink(instance, state, state.viewport);
            instance.tick(state, dtMs, admitted);
        }
        session.orchestrator.endFrame();
        ```
2. **`setupSnakeGame.js`**:
    - Wrap the main tick call nicely; no need to create a massive God object.
3. **HPA Sessions**:
    - `HpaPathSession` is deliberately kept separate. It controls worker queue slots and pathing limits. The orchestrator sits _above_ it and implicitly reduces HPA requests by throttling how often agents evaluate their intent.

---

## Implementation Sequence

1. Add `aiBudget` to `Config/games/snake.js` and delete `brainSyncOffScreenInterval`.
2. Delete obsolete brain sync logic in `observerVisionFrame.js` and `syncSpatialBrain.js`.
3. Create `agentFrameOrchestrator.js` and write the admission logic.
4. Wire admission flags through `snakeAgentSession.js` and split the logic in `agentAutosim.js`.
5. Rewrite and clean up `tests/snakePerfBudget.test.js` and `tests/gridCellVision.test.js` to reflect the new structure, strictly following `hygiene.md` to remove any test shims.
6. Verify no behavior regressions and that off-screen agents still move fluidly while saving main-thread cycles.
