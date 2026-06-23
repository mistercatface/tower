# FSM + flow horizons

## Status

| | |
|--|--|
| **Phase 1** | Reach dialect ✅ — [`history.md`](history.md#phase-1-reachsteps) |
| **Part 1** | Passes A–G ✅ — [`history.md`](history.md#part-1-ai-consumer-cleanup) |
| **Part 1.5** | **Pass H** — unified decision engine (plan below) — optional before Part 2 |
| **Part 2** | Flow locomotion 2a → 2b → 3 — **unblocked** (Pass G ✅) |

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
| [`history.md`](history.md) | Shipped phase 1 + Part 1 archive — **do not regress** |
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
- **One-export micro-files** whose only caller is another module in the same PR (inline or merge — see Part 1 review in [`history.md`](history.md#part-1-verdict))

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
| Pass F-style file sprawl (5 helpers × 1 consumer) | Merge into the factory file that owns the call site |

### Normalization rules (this plan)

```text
One distance for AI decisions: reachSteps (nav path steps) — FROZEN, see history.
Perception and memory: targets only — never distance.
One factory per duplicated concept (memory, perception options, intent adapter shell).
One threat derive, one ally derive — species-neutral names in Libraries/AI.
Flee must not import generic code from snakeDecisionModel.js.
Prefer fewer files over “perfect” folder purity when only one caller exists.
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

| Good | Bad |
|------|-----|
| `readAgentRouteStatus(locomotion, agent, state)` — one function, two callers | Copy-pasted 20-line closure in snake + flee |
| `syncNavReachHorizon` then many `navReachStepsTo` lookups | Per-target sync or per-target horizon objects |
| Config read once at adapter boundary | Resolver chain wrapping `getSnakeGameConfig()` |

### Frozen — decision reach (phase 1, do not regress)

Authoritative detail: [`history.md`](history.md#the-rule-frozen--do-not-regress).

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

# part 1 — flee must not import snake decision model
rg "from.*snakeDecisionModel" Libraries/Game/snake/fleeAgent --glob '*.js'

# part 1 — no duplicate helpers left in decision models
rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
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

- **OK when both consumers import:** `deriveThreatState`, `deriveAllyState`, `targetEvents` (incl. policy helpers), `createAgentIntentMemory`, `utilityScoring` (incl. hunger/flee scorers), `createGroundNavIntentAdapter`
- **Merged:** Pass F micro-files inlined into adapter / `targetEvents` / `utilityScoring` — see [`history.md`](history.md#consolidation-backlog--merged)
- **Not OK:** `Libraries/AI/decision/` · index barrels · `{ createDecisionFramework }` · config resolver getters · passthrough context builders

**Same PR:** both `createSnakeForageIntent` and `createFleeExploreIntent` (and both decision models) must import every new shared module in the PR that introduces it.

### PR review bar (minimum)

- [ ] Net negative line count (or justify in comment — default is no)
- [ ] No new getters, resolvers, or passthrough layers
- [ ] No `*Dist` / `reachForCandidate` / `checkReachability` / `Libraries/AI/decision`
- [ ] Reach still computed once at intent adapter; flow not used for scoring
- [ ] Both consumers updated if touching shared AI code
- [ ] Tests: real `syncNavReachHorizon` or stub `reachSteps` on context — not mock horizon objects
- [ ] New file count justified — merge single-consumer helpers into owner module

---

## Part 1 — done (archive)

Snake/flee dedupe: generic derives, memory, perception, decision helpers, intent adapter shell. Full pass log, file ledger, Pass G gates, and honest verdict: [`history.md` § Part 1`](history.md#part-1-ai-consumer-cleanup).

---

## Part 1.5 — Pass H — unified decision engine (plan only)

**Do not start until Pass G ✅.** Not a framework folder, not a scoring DSL, not `Libraries/AI/decision/`.

**Problem:** `snakeDecisionModel.js` (~227 lines) and `fleeDecisionModel.js` (~191 lines) still duplicate the same pipeline — blackboard assembly → `scoreCandidateSet` → `pickBestScoreKey` → `policyForScoredMode` → snapshot. Weights/pressure already live in `Config/games/snake.js`; the copy-paste is structural, not tuning.

**Payoff:** one `buildAgentDecisionContext` + mode/scorer registration. Snake and flee each supply **2–3 scorer functions** and **one blackboard hook** (snake: ally engagement filter; flee: prey→enemy alias). Target **~300 duplicate lines removed** without new micro-modules.

### Bar

| Rule | Detail |
|------|--------|
| **One engine file** | e.g. `Libraries/AI/agents/buildAgentDecisionContext.js` — owns blackboard skeleton, event push, score loop, snapshot shape |
| **Species wiring ≤ ~50 lines each** | `snakeDecisionModel.js` / `fleeDecisionModel.js` become spec tables + hooks only |
| **No new micro-modules** | Unless **both** species import them in the same PR |
| **No framework package** | No `Libraries/AI/decision/`, no `{ createDecisionFramework }`, no config resolver chain |
| **Tuning stays in config** | `decisionWeights`, `decisionPressure`, `fleeAgent.*` — not a JSON scoring DSL |
| **Tests unchanged semantics** | Same `buildSnakeDecisionContext` / `buildFleeDecisionContext` exports; 75+ intent/decision tests green |

### What moves into the engine (shared)

```text
visible / remembered / known assembly (parametric slot names)
pushTargetEvents + routeEvents + TARGET_LOST guards
scoreCandidateSet → pickBestScoreKey → intentPolicy
decisionSnapshot scaffold (events, routeStatus, candidateScores, sprintIntent slot)
deriveThreatState + deriveAllyState wiring (already shared)
```

### What stays in species files (by design)

| Snake | Flee |
|-------|------|
| Modes: `seek_prey`, `seek_ally` | Modes: `seek_enemy`, `seek_ally` |
| `resolveKnownAlly` + `isAgentEngaged` hook | `prey` → `enemy` alias on visible/known |
| `scorePreyDetail`, `scoreSeekAllyDetail` (leadworthy, size factor) | `scoreEnemyDetail`, `scoreFlee` (outnumbered bonus), flee `scoreSeekAllyDetail` |
| `deriveSnakeHungerState`, `deriveSprintIntent`, engagement publish | `deriveFleeHungerState`, `deriveFleeSprintIntent` |
| `deriveSnakeEngagementState` on snapshot | — |

### Species spec shape (sketch)

```javascript
export const snakeDecisionSpec = {
    config: () => getSnakeGameConfig(),
    modes: ["flee", "seek_prey", "seek_food", "seek_ally", "explore"],
    slots: { threat: "threat", prey: "prey", food: "food", ally: "ally" },
    resolveKnown: resolveKnownAlly,
    scorers: { flee: scoreRiskAdjustedFlee, seek_prey: scorePreyDetail, /* … */ },
    deriveHunger: deriveSnakeHungerState,
    deriveSprint: deriveSprintIntent,
    afterPick: (bb, intent) => { bb.facts.engagementState = deriveSnakeEngagementState(bb, intent); },
};
```

Flee spec mirrors with `enemy` slot, flee scorers, no engagement hook.

### Pass H review bar

- [ ] One engine file; species files ≤ ~50 lines each
- [ ] Net negative LOC (~−300 target)
- [ ] No `Libraries/AI/decision/` · no scoring DSL · no resolver getters
- [ ] Both `buildSnakeDecisionContext` and `buildFleeDecisionContext` still exported
- [ ] All intent/decision tests green
- [ ] Grep gates in this doc still clean

---

## Part 2 — Flow locomotion (unblocked)

Decision reach stays on `navReachHorizon` — flow fields **steer**, sync BFS **scores**.

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
Part 1 (Pass G) ✅ ──► 2a flee flow
                         ├──► 2b hybrid HPA+flow
                         └──► 3 blended fields
Pass H (optional) ── parallel, no reach regression
```

Cross-doc: [`../../pathfinding.md`](../../pathfinding.md) Tier 3 · `flowGroundNavBehavior.js`, `cellTargetHpaNav.js`

---

## Review bar

### Part 1

- [x] Passes A–G — see [`history.md`](history.md#part-1-ai-consumer-cleanup)
- [x] Pass G grep gates (2026-06-23 — clean on disk; 75 intent/decision tests)
- [x] Consolidation backlog — 8 micro-files merged (see history)

### Part 1.5 (Pass H — plan only)

- [ ] One `buildAgentDecisionContext` engine file
- [ ] Species wiring ≤ ~50 lines each; ~−300 duplicate LOC
- [ ] No framework folder / scoring DSL / new micro-modules without dual import

### Part 2

- [ ] 2a: flee steers from flow sample
- [ ] 2b: snake seek HPA waypoint + local flow
- [ ] 3: blended fields; no `pickFleeCell` in flee
- [ ] Decision reach still `navReachHorizon` only
