# FSM + flow horizons

## Status

| | |
|--|--|
| **Phase 1** | Reach dialect done ✅ — [`history.md`](history.md) |
| **Part 1** | Pass A–E ✅ · **Pass F next** |
| **Part 2** | Flow locomotion 2a → 2b → 3 — **blocked until Part 1 grep gates pass** |

---

## Read this first — hygiene law

**Every pass on this plan is a deletion pass dressed as cleanup.** Pick one dialect, one write site, one factory per duplicated concept. Net **negative** line count. If the diff adds layers, getters, barrels, or copy-paste with a new filename — **stop**.

This work spans AI, navigation, and game adapters. The spoke docs below are **binding**. Re-read the relevant rows before opening a PR.

### Authority docs

| Doc | Governs for this plan |
|-----|------------------------|
| [`../stupid.md`](../stupid.md) | No getter/resolver theater; no fake “load” or mini-services; static config = import at use site; no threading catalogs through constructors; **delete > add** |
| [`../passthrough.md`](../passthrough.md) | No forwarding layers; no parallel bags; no `{ buildX }` that only passes args through; Tier 1b reach passthrough **must not come back** |
| [`../normalization.md`](../normalization.md) | One dialect end-to-end; one shared module per duplicated pattern; structural wins not micro-opts; Part 1 before flow locomotion |
| [`../objects.md`](../objects.md) | Hot path = module scratch + generation stamp; **zero** per-tick `{ stepsTo() }`, opts bags, `new TypedArray` in decision tick |
| [`../frame.md`](../frame.md) | Shared sync pattern: **sync once · read many** — like `viewport`, not a returned handle object |
| [`inventory.md`](inventory.md) | Pass A symbol map — duplication line refs for Pass B–F |
| [`history.md`](history.md) | Phase 1 shipped contract — **do not regress** |
| [`../../AI.md`](../../AI.md#future-local-flow-horizons) | Generic loop in `Libraries/AI`; species facts/scorers in game adapters |
| [`../../pathfinding.md`](../../pathfinding.md) | Flow infra detail; HPA + flow hybrid notes for Part 2 |

### What “passthrough” means here

A function, object, param, or layer that exists **only to forward data the caller already has**. In this plan that includes:

- Copying distance/target fields perception → memory → blackboard → scorer (Tier 1b — **dead**, see [`history.md`](history.md))
- Threading `reachSteps` through memory enrich instead of computing once at intent adapter
- `buildNavReachHorizon()` → `{ stepsTo }` closure every agent
- `buildSnakeDecisionContext` / `buildFleeDecisionContext` wrappers that add no logic
- Threading the same config through 3 functions when `getSnakeGameConfig()` at the read site works
- Factory that returns one closure and nothing else
- Second blackboard layer (`visible.*Dist`, `remembered.*Dist`, `known.*Dist`) for the same fact

**Fix pattern:** compute at the boundary · pass scalars/records once · delete the copies.

### What “stupid shit” means here

From [`../stupid.md`](../stupid.md) — same class of mistakes that already burned us on props, draw, and boot:

| Stupid | Do instead |
|--------|------------|
| `resolveSnakeReachConfig()`, `resolve*Reach*`, any boot getter for static game config | `getSnakeGameConfig()` at use site |
| `Libraries/AI/decision/` package or barrel | Concrete file, e.g. `Libraries/AI/agents/deriveThreatState.js` |
| “Framework PR” extracting helpers before **both** snake + flee import them | Same PR wires both consumers or don’t extract |
| Generic perception→memory→blackboard slot pipeline | Shared **functions**, not a pipeline abstraction |
| Behavior-tree layer over intent | Out of scope |
| Pre-bake `fleeRangeCells` on config via boot resolver | Inline `Math.ceil` in threat derive ([`history.md`](history.md)) |
| `checkReachability` on flow types for decisions | Deleted — use `navReachHorizon.js` |
| Per-agent `FlowFieldWindow` for **utility scoring** | Sync BFS for decisions; flow windows **Part 2 locomotion only** |
| Mock `{ stepsTo: () => N }` in tests | Real `syncNavReachHorizon` or stub `reachSteps` on context |
| One-export barrels (`import from "../AI/foo/index.js"`) | Import owning module directly |

### Normalization rules (this plan)

```text
One distance for AI decisions: reachSteps (nav path steps) — FROZEN, see history.
Perception and memory: targets only — never distance.
One factory per duplicated concept (memory, perception options, intent adapter shell).
One threat derive, one ally derive — species-neutral names in Libraries/AI.
Flee must not import generic code from snakeDecisionModel.js.
```

| Need | Read from |
|------|-----------|
| Effort / hunt / food / ally cost | `blackboard.facts.reachSteps.*` |
| Committed route beyond horizon | `routeStatus.pathLen` when committed target matches — inline in adapter |
| Threat severity | `reachSteps.threat` + inline cell math + `cellSize` |
| Vision cone / nearest pick | Internal `distSq` in `classifyAgentVision` — **never exported** |

**No second dialect.** No `*Dist`, `lastDistanceCells`, `reachForCandidate`, euclidean fallback when path reach is null.

### Hot path / allocation ([`../objects.md`](../objects.md))

`navReachHorizon.js` = **module-level scratch** + generation stamp — same pattern as broadphase visited flags.

```text
Per agent per decision tick:
  syncNavReachHorizon(nav, x, y, maxSteps)   // overwrites scratch
  navReachStepsTo(target.x, target.y)          // read before next agent sync
```

- **Never** return a horizon object from sync
- **Never** read `navReachStepsTo` without fresh sync for that agent
- **Never** `{ stepsTo: () => null }` fallback objects on failure path
- **Never** `gridPathStepsBfs` + per-call `new TypedArray` in decision tick
- Part 2 flow windows: async/locomotion only — **not** on the decision hot path

### Sync-once pattern ([`../frame.md`](../frame.md))

Shared helpers extracted in Part 1 follow the same contract as draw pass:

| Good | Bad |
|------|-----|
| `readAgentRouteStatus(locomotion, agent, state)` — one function, two callers | Copy-pasted 20-line closure in snake + flee |
| `syncNavReachHorizon` then many `navReachStepsTo` lookups | Per-target sync or per-target horizon objects |
| Config read once at adapter boundary | Resolver chain wrapping `getSnakeGameConfig()` |

### Frozen — decision reach (phase 1, do not regress)

Authoritative detail: [`history.md`](history.md).

- **Module:** `Libraries/Navigation/navReachHorizon.js` only for decision reach BFS
- **Write site:** intent adapter only — `facts.reachSteps` on blackboard
- **Topology:** `requireSnakeVisionFrame(state).navTopology` at sync site — no resolver
- **Config:** `decisionReachHorizon` from `getSnakeGameConfig()` — no `resolveSnakeReachConfig`
- **Flow:** `FlowFieldWindow` / worker = **Part 2 steering** — never replace sync BFS for scoring

### Never ship (grep + smell test)

```bash
# phase 1 regression
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps|checkReachability' --glob '*.js'
rg 'Libraries/AI/decision' --glob '*.js'

# part 1 stench
rg "deriveSnakeThreatState|deriveAllyState|routeEvents" Libraries/Game/snake/fleeAgent --glob '*.js'
# must be zero — flee uses Libraries/AI only
```

| Banned | Why |
|--------|-----|
| `Libraries/AI/decision/*` new package | Barrel + framework theater |
| `buildNavReachHorizon()` → `{ stepsTo, topologyKey }` | Fake mini-service every agent |
| Reintroducing `*Dist` on visibleWorld / memory / blackboard | Passthrough + duplicate dialect |
| Threading reach through memory enrich | Passthrough — adapter only |
| Flow window / worker for utility reach | Wrong tool; async; phase 2 locomotion only |
| Extract shared module in PR that only updates snake | Flee must import in **same PR** |
| New folder with one consumer | Wait for two importers or inline |
| Copy-paste helper to “shared” file without deleting both copies | Net LOC must drop |
| Generic slot pipeline / BT layer | Deferred — not this plan |

### Extract rule (Part 1 dedupe)

- **OK:** `Libraries/AI/agents/deriveThreatState.js`, `Libraries/AI/agentIntent/routeEvents.js`, `Libraries/AI/memory/createAgentIntentMemory.js`, `Libraries/Game/snake/agentReachSteps.js` (game-layer modes)
- **Not OK:** `Libraries/AI/decision/` directory · index barrels · `{ createDecisionFramework }` · config resolver getters · passthrough context builders

**Same PR:** both `createSnakeForageIntent` and `createFleeExploreIntent` (and both decision models) must import every new shared module in the PR that introduces it.

### PR review bar (minimum)

- [ ] Net negative line count (or justify in comment — default is no)
- [ ] No new getters, resolvers, or passthrough layers
- [ ] No `*Dist` / `reachForCandidate` / `checkReachability` / `Libraries/AI/decision`
- [ ] Reach still computed once at intent adapter; flow not used for scoring
- [ ] Both consumers updated if touching shared AI code
- [ ] Tests: real `syncNavReachHorizon` or stub `reachSteps` on context — not mock horizon objects

---

## Part 1 — AI consumer cleanup

**Why first:** Phase 1 fixed reach, but snake and flee are still copy-paste forks. ~~Flee imports generic derives from `snakeDecisionModel.js`~~ (Pass B ✅). Intent adapters ~90% identical. Flow locomotion needs a clean intent/loco boundary.

### Stench inventory

| Smell | Where | Fix |
|-------|-------|-----|
| Flee imports snake for generic derives | ~~`fleeDecisionModel.js`~~ ✅ Pass B | `deriveThreatState`, `deriveAllyState`, `targetEvents` in `Libraries/AI/` |
| Duplicated decision helpers | ~~`pushTargetEvents`~~ ✅ Pass B; ~~`policyReasonForTarget`, `intentPolicy`, hunger/food/flee scorers~~ ✅ Pass E; still open: `policyForScoredMode` | Pass E ✅ / species mode tables stay local |
| Twin intent memory | ~~`snakeIntentMemory.js`, `fleeIntentMemory.js`~~ ✅ Pass C | `Libraries/AI/memory/createAgentIntentMemory.js` |
| Twin perception wrappers | ~~`snakeIntent.js`, `fleeWorldPerception.js`~~ ✅ Pass D | `agentIntentPerception.js` |
| ~270-line twin intent adapters | `createSnakeForageIntent.js`, `createFleeExploreIntent.js` | shared shell: route/reach/arrival/latch/effects |
| `reachStepsForMode` ×2 | both adapters | once — `Libraries/Game/snake/agentReachSteps.js` or shared adapter helper |
| Misnamed file | ~~`agentPopulationRegistry.js`~~ → `agentRelationship.js` ✅ Pass A | **dead code** — zero importers; delete or wire in Pass D |
| `deriveFleeAgentThreatState` | ~~thin wrapper~~ ✅ deleted Pass B | — |

**Stay in game adapters:** mode sets (`seek_prey` vs `seek_enemy`), engagement publish (snake), `regroupSizeFactor`, flee pack options, species blackboard shapes.

### Passes

| Pass | Work | Bar |
|------|------|-----|
| **A — Inventory** ✅ | Renamed `agentPopulationRegistry.js` → `agentRelationship.js`; symbol map in [`inventory.md`](inventory.md) | no behavior change |
| **B — Generic derives** ✅ | `deriveThreatState`, `deriveAllyState`, `targetEvents` → `Libraries/AI/`; deleted `deriveFleeAgentThreatState` | flee imports AI only — verified |
| **C — Intent memory** ✅ | `createAgentIntentMemory.js`; deleted species memory files | two call sites |
| **D — Perception** ✅ | `agentIntentPerception.js`; deleted species wrapper files; fixed `reachStepsForMode` pathLen-0 latch bug | one options builder + `perceiveAgentIntentWorld` |
| **E — Decision dedupe** ✅ | `intentPolicy.js`, `hungerEffort.js`, `scoreFleeIntent.js` | net −LOC; grep gate clean on policy/hunger helpers |
| **F — Intent adapter** | Shared shell; species files <120 lines | `reachStepsForMode` once |
| **G — Gate + docs** | Tests + doc sync | grep gates below |

### Grep gates (before Part 2)

```bash
rg "deriveSnakeThreatState|deriveAllyState|routeEvents" Libraries/Game/snake/fleeAgent --glob '*.js'
# zero — flee uses Libraries/AI only

rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
# zero or moved to AI

rg 'buildNavReachHorizon|resolveSnakeReachConfig|Libraries/AI/decision/' --glob '*.js'
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate' --glob '*.js'
```

---

## Part 2 — Flow locomotion (gated on Part 1)

**Do not start** until Part 1 gates pass. Decision reach stays on `navReachHorizon` — flow fields **steer**, sync BFS **scores**.

### 2a — Flee via backward flow

Replace `pickFleeCell` **steering** with local backward flow — sample downhill at agent cell.

| | |
|--|--|
| **Uses** | `FlowFieldWindow`, `computeFlowField`, `sampleFlowDirection`, worker offload |
| **Not for** | decision reach · deleted `checkReachability` |
| **Invalidation** | topology key / nav epoch · window recenter · threat move |
| **Touches** | flee effects · `groundNav/` · `FlowFieldWindow.js` |
| **Fallback** | keep `pickFleeCell` until stable; delete at 2a bar |

**Bar:** flee steers from flow sample; decision tick still sync `reachSteps` only.

### 2b — Hybrid HPA + local flow

HPA owns cross-map plan; local flow executes to next waypoint.

| | |
|--|--|
| **Uses** | `cellTargetHpaNav` route + flow window at waypoint |
| **Reach gate** | existing `reachStepsForMode` / `pathLen` — no new dialect |
| **Primary consumer** | snake seek modes |
| **Invalidation** | waypoint reached · HPA replan · topology bump |

**Bar:** seek modes sample flow locally; HPA still owns distant goals.

### 3 — Blended multi-source fields

One cost field from weighted sources — replaces `pickFleeCell` + `resolveFleePackOptions` heuristics.

| Source | Role |
|--------|------|
| Threat | Repulsion |
| Ally centroid | Attraction / pack flee |
| Food | Weak attraction when hungry |
| Brain penalty | Explore cost overlay |

**Bar:** flee + pack from field sampling only; delete `pickFleeCell` flee path.

### Dependency

```text
Part 1 ──gate──► 2a flee flow
                    ├──► 2b hybrid HPA+flow
                    └──► 3 blended fields
```

Cross-doc: [`../../pathfinding.md`](../../pathfinding.md) Tier 3 · `flowGroundNavBehavior.js`, `cellTargetHpaNav.js`

---

## Review bar

### Part 1 (open)

- [x] Pass A inventory — [`inventory.md`](inventory.md)
- [x] Pass B — flee does not import generic derives from `snakeDecisionModel.js`
- [x] Pass C — one intent memory factory
- [x] Pass D — one perception options builder (`agentIntentPerception.js`)
- [ ] Pass E — decision model dedupe
- [ ] Net −LOC across snake+flee pair
- [ ] Part 1 grep gates pass

### Part 2 (blocked on Part 1)

- [ ] 2a: flee steers from flow sample
- [ ] 2b: snake seek HPA waypoint + local flow
- [ ] 3: blended fields; no `pickFleeCell` in flee
- [ ] Decision reach still `navReachHorizon` only
