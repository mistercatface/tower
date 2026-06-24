# FSM AI ROADMAP

MUST READ BEFORE CONTINUING: `[hygiene.md](hygiene.md)` · `[objects.md](objects.md)` · `[frame.md](frame.md)` · `[passthrough.md](passthrough.md)`

---

## Current state

**End state:** Snake, flee, and squid agents share one explicit intent FSM. Perception and memory feed a reusable decision context; decision scoring chooses a policy; FSM states own enter/update effects; locomotion remains the cell-target HPA adapter until flow execution is deliberately wired in. Local decision reach now reads the flow worker's per-target distance slots instead of running per-agent forward reach BFS in the hot intent path.

**Cross-doc:** `[pathfinding.md](../pathfinding.md)` Tier 3/4/7 · `[AI.md](../AI.md)` local flow horizons · `[hygiene.md](hygiene.md)` / `[frame.md](frame.md)` for tick frames.

### Implemented

| Area | Current code |
|------|--------------|
| Shared intent FSM | `createAgentIntent` drives `explore`, `seek_*`, and `flee` states from `intentStates.js`; `createGroundNavIntentAdapter.js` owns the stable context frame, effects, mode latch, memory, and FSM snapshot. |
| Profile-driven decisions | `Config/games/snake.js` defines snake/flee/squid reach slots, committed slots, mode order, decision schemas, sprint rules, flee latch behavior, and return shape. |
| Decision context | `gameDecisionContext.js` resolves profile specs; `buildAgentDecisionContext.js` merges visible + remembered targets, reach steps, route status, threat/ally state, events, chosen policy, and sprint intent. |
| Flee/snake/squid autosim | `agentAutosim.js` creates the shared intent adapter for all three profiles, applies sprint speed/accel, handles metabolism, and exposes focused FSM snapshots. |
| Flow-backed reach | `createGroundNavIntentAdapter.js` calls `buildFlowTargetStepsInto`; `flowTargetSteps.js` reads committed route length first, then `FlowFieldGrid.readFlowStepsForTarget`; `FlowFieldWorkerEntry.js` writes both vector maps and distance maps into shared slot pools. |
| Flow infrastructure | `FlowFieldGrid` owns a centered `FlowFieldWindow`, `FlowCacheManager` slot cache, flow-to-nav mapping, topology binding to the HPA worker's nav arena, shared vector/distance pools, and async worker readiness. |
| Sandbox flow locomotion | `flowGroundNavBehavior.js` and `driveFlowGroundNav.js` support cursor/selection flow steering for placed rolling props. |
| Coverage | `snakeFsmTransitions.test.js`, `snakeDecisionModel.test.js`, `fleeAgentDecision.test.js`, `fleePackBlend.test.js`, `groundNavArrival.test.js`, and `flowFieldFrame.test.js` cover FSM transitions, decision scoring, flee pack blend, flow frame mapping, and sandbox flow arrival. |

### Not current anymore

- The old plan's "Phase A reach BFS off main thread" is done in spirit for live snake/flee/squid decision reach: intent scoring no longer imports `syncNavReachHorizon` / `navReachStepsTo`.
- `Libraries/Navigation/navReachHorizon.js` still exists with its focused tests, but it is not the live ground-agent decision reach path.
- The deleted `flow-reach-deprecation.md` link should not be treated as an active planning dependency.
- Flow locomotion is not blocked on reach cleanup anymore; the remaining blocker is cleanly integrating flow execution with the existing cell-target/HPA locomotion contract.

---

## Roadmap

### 1. Tighten flow reach semantics

**Goal:** Make flow-backed reach a first-class decision input with clear readiness and no hidden extra distance model.

| Step | Work | File / area |
|------|------|-------------|
| 1.1 | Audit first-frame and not-ready behavior in `readTargetSteps`; decide whether "unknown" should beat approximate octile in scoring. | `flowTargetSteps.js`, decision tests |
| 1.2 | Add targeted tests for ready flow distance, not-ready flow distance, stale cache expiry, and committed route length precedence. | new or existing reach/decision tests |
| 1.3 | Add lightweight diagnostics to focused FSM snapshots for reach source (`route`, `flow`, `stale`, `unknown`) if the UI needs to explain surprising choices. | `createGroundNavIntentAdapter.js`, focused debug |
| 1.4 | Decide whether `navReachHorizon.js` is debug/test-only or removable; delete it only when no non-test caller remains. | `Libraries/Navigation/`, `tests/navReachHorizon.test.js` |

**Done when:** Decision reach has an explicit source contract, tests cover flow readiness, and there is no accidental reintroduction of per-agent forward BFS in live autosim.

### 2. Wire flow locomotion into agent intent

**Goal:** Flee escape/regroup steering uses flow downhill while the FSM still selects the same flee/seek policies and destinations.

| Step | Work | File / area |
|------|------|-------------|
| 2.1 | Add a profile or mode-level locomotion choice for local execution (`flee`, then `seek_ally` for regroup) without changing decision scoring. | `Config/games/snake.js`, `agentAutosim.js` |
| 2.2 | Extend the cell-target locomotion seam so intent effects can request flow execution for local destinations and HPA execution for long routes. | `createGroundNavIntentAdapter.js`, `cellTargetHpaNav.js`, `driveFlowGroundNav.js` |
| 2.3 | Reuse the existing `FlowFieldGrid` window/cache/worker path; do not create per-agent flow windows or a second flow cache unless profiling proves the shared window cannot serve crowds. | `FlowFieldGrid.js`, `flowGroundNavBehavior.js` |
| 2.4 | Add a targeted locomotion test: a flee agent in a constrained local layout moves downhill through flow and preserves existing FSM transition reasons. | new focused test |

**Done when:** Flee agents can execute escape/regroup using flow steering, the FSM snapshots remain stable, and HPA remains the route planner for non-local committed movement.

### 3. Scale the flow worker path

**Goal:** Keep flow reach + locomotion cheap under snake/flee/squid crowd counts.

| Step | Work | File / area |
|------|------|-------------|
| 3.1 | Profile current slot churn with the shared 512-slot cache under representative snake/flee/squid counts. | `FlowCacheManager`, perf harness |
| 3.2 | Add prioritization only if measurements show editor flow, off-screen agents, and focused/on-screen agents are competing for worker slots. | `PathfindingWorkerClient`, `SabSlotWorkerHost`, `FlowFieldGrid` |
| 3.3 | Make worker lifecycle failure visible rather than silently degrading decision reach or locomotion. | `PathfindingWorkerClient`, focused debug |
| 3.4 | Revisit multi-worker flow only after slot churn or worker time shows up in profiles. | worker host/runtime |

**Done when:** Profiles show no main-thread local BFS in live agent decisions and flow worker cost is visible, bounded, and explainable.

### 4. Continue FSM hygiene

**Goal:** Keep the FSM explicit, profile-owned, and easy to inspect as more agent behaviors arrive.

| Step | Work | File / area |
|------|------|-------------|
| 4.1 | Keep new modes as `intentStates.js` state objects plus profile schema entries; avoid new decision packages or resolver layers. | `intentStates.js`, `snake.js` config |
| 4.2 | Preserve one context frame per intent instance; no per-tick option bags for decision or locomotion. | `createGroundNavIntentAdapter.js` |
| 4.3 | Extend focused debug from the existing FSM snapshot instead of adding separate overlay state. | `getGroundNavFsmSnapshot`, focused debug modules |
| 4.4 | Add behavior tests at the FSM boundary when changing mode selection, latch timing, sprint rules, or target memory. | existing snake/flee tests |

---

## Rules

- One decision model: profile schema + utility scoring + explicit FSM states.
- One local distance source for live agents: flow distance slots, with committed route length taking precedence.
- One execution seam: intent effects talk to cell-target locomotion; locomotion chooses HPA or flow internally.
- No new getters, passthrough wrappers, or `Libraries/AI/decision/` package.
- Tests move with the behavior; do not leave old and new paths both active unless a persistence boundary requires it.

---

## Later

- Strategy / game theory / GOAP remains deferred; see `[AI.md](../AI.md)` tier 8.
- Generic perception→memory→slot pipeline remains deferred; current profiles already share the important frame and schema pieces.
- Decision context pooling across agents is not the model; keep one frame per intent instance.
