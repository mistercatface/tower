# Snake Game + FSM AI Codebase Audit

This audit tracks the current snake-game FSM/AI shape against the cleanup rules in `hygiene.md`, `normalization.md`, and [`fsmroadmap.md`](fsmroadmap.md).

---

## 1. Roadmap & Task Status Dashboard

### AI & FSM Roadmap

- **Part 1: AI consumer dedupe + flow reach** — ✅ complete.
  - `flowTargetSteps.js` and `flowReachStaleCache.js` provide decision reach.
  - `AgentDecisionContext.js` owns shared facts/scoring.
  - `GroundNavIntentAdapter.js` owns target memory, committed goals, combat phases, and HPA handoff for the snake game.
  - `AgentProfiles.js` owns profile ids, registry helpers, and engagement facts.
- **Part 2: Local flow locomotion** — ⬜ pending.
  - Agents still use HPA via `cellTargetHpaNav`.
  - Flow is used for sandbox flow nav and decision reach, not agent locomotion.
- **Part 3: Worker/slot scaling** — 🟡 evidence-driven follow-up.
- **Part 4: FSM hygiene** — 🟡 cleanup only; no new framework unless another game mode needs it.

### Hygiene & Passthrough

- Viewport/draw-input/elevation-camera cleanup remains ✅.
- AI distance passthrough is ✅: reach is a fact, not copied `*Dist` fields.
- Remaining concern is hot-path wrapper allocation, not architectural duplication.

---

## 2. Current Stack

```text
AgentIntent.js
  generic flat FSM host

GroundNavIntentAdapter.js
  perceive with memory
  commit/clear targets
  tick combat action
  route to HPA target

AgentDecisionContext.js
  merge visible/remembered slots
  derive threat/hunger/ammo/combat facts
  score profile decision modes
  derive engagement state

AgentInstance.js
  AgentAutosim.tick(dtMs, admitted)
  AgentMetabolism
  relationship rules
  HPA nav instance
```

The old module names `createSnakeForageIntent`, `snakeIntentMemory`, `snakeDecisionModel`, `agentProfile.js`, and `AI/memory/targetMemory.js` should not return as compatibility shims.

---

## 3. Hot-Path Allocation Smells To Recheck

These are cleanup candidates, not blockers:

1. **Vision classification result objects**
   - `classifyAgentVision.js` returns a result object and may allocate centroid objects.
   - Potential fix: write into a reusable per-agent/per-frame result object if profiling shows churn.

2. **Decision context wrapper objects**
   - Adapter-to-context code can still create wrapper inputs before writing onto a flat decision frame.
   - Potential fix: let `GroundNavIntentAdapter` write directly to the preallocated decision context.

3. **Mode score detail containers**
   - Candidate detail maps are useful for HUD/debug, but should be reused if they show up in profiles.
   - Keep public debug behavior; do not assert on private reason strings in tests.

4. **Per-tick relationship/perception options**
   - If closures or option bags appear in the tick path, cache them on the instance/profile boundary.

---

## 4. Parameter-Threading Smells

The main risk now is rebuilding passthrough layers around the cleaned-up adapter.

Avoid:

- adding new per-species wrapper modules that only call `AgentDecisionContext`;
- copying target facts through visible → memory → blackboard → scorer fields;
- adding "compat" names for deleted files;
- adding production optional paths just to simplify tests.

Prefer:

- profile schema for mode setup;
- adapter boundary facts written once;
- direct imports from owning modules;
- focused harness updates in `tests/harness/snakeGameHarness.js`.

---

## 5. Big Opportunities

1. **Local flow locomotion**
   - First `flee_agent`, then hybrid snake HPA→flow execution.
   - Active plan: [`fsmroadmap.md`](fsmroadmap.md) Part 2.

2. **Flatten decision writes**
   - Reduce wrapper object creation between adapter and decision context.

3. **Path smoothing**
   - HPA still produces raw grid-center paths; string-pull smoothing is the highest visible movement polish.

4. **Local separation**
   - Rigid-body contact handles collisions, but there is no steering-level crowd layer.

_Last updated: current consolidated profile-driven FSM stack._
