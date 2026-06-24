# FSM AI IMPLEMENTATION PLANNING

MUST READ BEFORE CONTINUING: `[hygiene.md](hygiene.md)` · `[objects.md](objects.md)` · `[frame.md](frame.md)` · `[passthrough.md](passthrough.md)`

---

## AI–FLOW architecture plan

**End state:** Flee (then snake pack/regroup, then any ground-nav plugin) selects **flow locomotion** through the same ground-nav adapter seam HPA uses today. All **local** backward BFS (reach horizons + flow fields) migrates to the **flow worker** pool; main thread only samples direction / reads precomputed step counts. Long range stays **HPA worker**. One nav topology, two worker dialects, zero third distance model.

**Cross-doc:** [pathfinding.md](../pathfinding.md) Tier 3 (flow fields), Tier 4 (workers), Tier 7 (crowd) · [AI.md](../AI.md) local flow horizons · [hygiene.md](hygiene.md) / [frame.md](frame.md) for tick frames.

### Performance baseline (~4 s profile, 64×3 agents)

| Hot spot | ~ms | ~% | Gated on BFS cleanup? |
|----------|-----|-----|------------------------|
| `runHorizonBfs` / `syncNavReachHorizon` | 614 | **15.5** | **Yes — fix first** |
| `runCollisionPipeline` | 1,714 | 43.3 | No (physics — parallel track) |
| `queryView` / `_queryInAabb` / `_fillViewCandidates` | ~560 | ~14 | No (spatial query — own pass later) |
| `WorldObstacleGrid` / broadphase / SAT | ~450 | ~11 | No |
| Render (`drawImage`, etc.) | ~57 | 1.4 | No |
| `buildAgentMemberToInstanceMap` | 36 | 0.9 | No (combat — cheap win separate) |

**Today:** Every agent `perceiveWithMemory` calls `syncNavReachHorizon` → full forward BFS from agent cell (`decisionReachHorizon` ≈ 32) into module scratch. **~192 BFS passes/tick** at snake+flee+squid counts. Flow fields would **add** backward BFS on top if we wire flee flow first — unacceptable.

**Gated on Phase A (do not ship flow locomotion until green):**

- Flee flow steering plugin
- Per-agent flow window pool ([pathfinding.md](../pathfinding.md) Tier 3 ⬜)
- Flow worker slot scaling beyond sandbox drag-nav
- Merging reach lookups into flow `bfsDistances` (Phase C)

**Not gated (can proceed in parallel):**

- Collision / broadphase / render perf
- HPA replan policy, path smoothing (pathfinding Tier 2/6)
- Combat map rebuild, overlay read-only paths
- Decision engine / FSM hygiene (step 7 ✅)

---

### Phase A — Reach BFS off main thread **← do first**

**Goal:** `runHorizonBfs` disappears from the main-thread profile. Same decision outcomes; only where BFS runs changes. Unblocks Phase B flow locomotion (which would add *more* BFS if reach is still on-thread).

**Immediate next step — reach horizon on the existing flow worker (not Phase C merge, not flee steering yet):**

| Step | Work | File / area |
|------|------|-------------|
| **A1** | **Worker reach job** — new message e.g. `updateReachHorizon { startCol, startRow, maxSteps }`; extract forward BFS from `navReachHorizon.js` into a module the worker can import; write `distances` + `visitGen` into a SAB slot (reuse `FlowFieldWorkerEntry` + `PathfindingWorkerClient` slot handshake) | `FlowFieldWorkerEntry.js`, `navReachHorizon.js`, new shared BFS helper |
| **A2** | **Reach slot pool + host** — N SAB distance buffers (or frontier-bounded windows — see A5); `NavRuntime` / snake tick posts one job per agent, main reads `navReachStepsTo` from slot view instead of module scratch | `FlowFieldGrid.js` or sibling `ReachHorizonHost.js`, `createGroundNavIntentAdapter.js` |
| **A3** | **Tick barrier** — batch all reach posts, then `waitForSlot` / poll before `buildAgentReachStepsInto` (today BFS is sync inside each `perceiveWithMemory`; must split submit vs read or main still blocks per agent) | `snakePerception.js`, adapter |
| A4 | **Off-screen throttle** (optional after worker) — skip jobs for off-screen agents; saves worker queue depth, not main-thread BFS | adapter + `reachSyncOffScreenInterval` |
| A5 | **Frontier-bounded slot** (optional) — slot size `(2×maxSteps+1)²` not full `cols×rows`; smaller SAB, same semantics inside horizon | shared BFS helper |
| ~~A2 dedupe~~ | **Skip** — A1 profiling showed dup ratio ≈ 1.0; agents rarely share a start cell | — |

**A1 profiling findings (instrumentation discarded — conclusions kept):**

- ~**335 syncs/tick** at horizon 32, **dup ratio ≈ 1.0** → cell dedupe is not the lever.
- Halving horizon 32→16 cut **visited avg ~1520 → ~370** (~4× less BFS *work*); sync count unchanged (~300/tick). Tuning horizon is optional; **worker move fixes the 15% main-thread line regardless.**
- Existing flow worker already has: `bindFlowNavArena` (blocked SAB), `bfsDistances`/`bfsQueue` scratch, slot `requestId` handshake. Reach job is a **forward** BFS on `octileNeighbors` — different from backward `computeFlowField`, same worker process.

**Not the first step:**

- **Phase C “unified horizons”** — one backward flow field serving reach lookups; do after reach is off-thread and flee flow exists.
- **Phase B flee steering** — adds backward BFS on top; ship after Phase A barrier is green.

**Phase A done when:**

- Main-thread profile: **`runHorizonBfs` ≈ 0%** in snake game (worker trace shows reach jobs instead)
- `navReachHorizon.test.js` + decision/FSM suites green — tests hit worker path or stub slot reads, no `{ stepsTo: () => N }` shims
- Slot layout documented for Phase C handoff

---

### Phase B — Flee flow locomotion plugin

**Goal:** Flee escape + regroup steering uses flow downhill; decision scoring unchanged.

| Step | Work | File / area |
|------|------|-------------|
| B1 | **Locomotion profile flag** — `agentProfiles.flee_agent.groundNav.locomotion: "flow"` (or mode-gated: flow only in `flee` / `seek_ally`) | `Config/games/snake.js`, `agentAutosim.js` |
| B2 | **Adapter seam** — cell-target intent calls flow steer path for local goal (threat away vector / ally centroid), HPA for long `headNav` routes | `createGroundNavIntentAdapter.js`, `driveFlowGroundNav.js` |
| B3 | **Rolling window per flee** — small `FlowFieldWindow` centered on agent (not map-sized `FlowFieldGrid`); goal = flee cell or pack anchor | `flowFieldWindow.js`, new `agentFlowWindow.js` |
| B4 | **Steering merge** — flow direction + existing roll actuator; no new per-tick opts bag (reuse intent frame) | `flowSteering.js`, `kineticRollActuator.js` |
| B5 | **Tests** — flee decision tests unchanged; new locomotion/integration test: flee in corner exits via flow downhill | `fleeAgentDecision.test.js`, new `fleeFlowLocomotion.test.js` |

**Phase B done when:** Flee visibly smooths in crowds; utility `reachSteps` still from `navReachStepsTo`; step 7 grep gates green; Phase A metrics still met.

---

### Phase C — Unified local horizons (reach + flow)

**Goal:** One backward BFS serves **both** flow direction and step-count reach when goal lies inside window.

| Step | Work | Notes |
|------|------|-------|
| C1 | Per-agent flow slot pool (pathfinding Tier 3 ⬜) | N slots × window size, not map-wide grid |
| C2 | After flow BFS, `navReachStepsTo` reads from slot `bfsDistances` when goal in window | Delete duplicate forward BFS for agents with active flow goal |
| C3 | Hybrid: HPA polyline for global plan, flow window for execution + local reach | `cellTargetHpaNav.js` handoff radius |
| C4 | Offload slot compute to **flow worker** — main thread poll + sample only | Extends `FlowFieldWorkerEntry` message types |

**Phase C done when:** Forward `runHorizonBfs` only runs for agents **without** an active flow slot or off-window targets; decision + locomotion share one distance field inside window.

---

### Phase D — Full flow worker migration

**Goal:** All local BFS off main thread; main thread collision + render + sample.

| Step | Work | Notes |
|------|------|-------|
| D1 | Worker pool N>1 ([pathfinding.md](../pathfinding.md) Tier 4 ⬜) | Reach + flow jobs share slot host |
| D2 | Priority tiers — on-screen flee/snake > off-screen > sandbox editor flow | Align with HPA replan priority |
| D3 | Crash recovery / respawn | Tier 4 gap today |
| D4 | Delete main-thread `runHorizonBfs` except debug/cold path | `navReachHorizon.js` becomes read facade over worker SAB |

**Phase D done when:** Profile shows no `runHorizonBfs` on main thread in snake game mode; flow worker queue visible in trace; [ROADMAP.md](../ROADMAP.md) pathfinding worker row moves toward ✅.

---

### Flow rules (all phases)

- Flow windows = **locomotion only** until Phase C explicitly merges reach reads.
- No second distance dialect — octile steps everywhere ([hygiene.md](hygiene.md)).
- One frame per instance — flow state lives on autosim/intent, not module globals (except worker scratch).
- Snake + flee in same PR when touching `createGroundNavIntentAdapter.js`.
- Net negative LOC unless measured perf gain explains delta.

---

### Flow locomotion ← **NEXT** (Phase B — after Phase A)

**Problem:** Flee escape/regroup uses cell-pick heuristics; crowds want smooth local flow.

**Do:** Replace flee **steering only** (not decision reach) with backward flow sampling at the agent cell. Decision **scoring** keeps `navReachHorizon` until Phase C merges reach into flow distance reads. Locomotion-only — flow windows never on the utility scoring hot path. Same adapter / frame hygiene as step 7.

**Do not start flee flow wiring until Phase A (reach on worker) lands** — profile already shows BFS winning before we add per-agent flow BFS.

**Rules:**

- Flow windows are locomotion-only — never on utility scoring hot path.
- Flow reads/writes follow step 7 frame pattern — no new per-tick opts bags.
- Snake + flee in same PR when touching shared adapter code.

**Phase B done when:** Flee escape/regroup uses flow downhill; reach for scoring unchanged; step 7 gates still green.

---

## PR rules (every step)

- Net negative LOC unless you explain why.
- Tests migrate with the dialect — same PR, no shims.
- No new getters, resolvers, `Libraries/AI/decision/` package, or passthrough wrappers.
- Read `[hygiene.md](hygiene.md)` before opening the PR.

---

## Later (not gated on 7/8)

- Strategy / game theory / GOAP — see `[AI.md](../../AI.md)` tier 8 (not started).
- Generic perception→memory→slot pipeline — deferred; step 7 collapses bags without building a framework.
- Decision context pooling across agents — not the model; one frame **per instance**, not module scratch.
