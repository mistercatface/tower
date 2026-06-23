# FSM + flow horizons

## Status

| | |
|--|--|
| **Phase 1** | Reach dialect ✅ — [`history.md`](history.md#phase-1-reachsteps) |
| **Part 1** | Passes A–G ✅ — [`history.md`](history.md#part-1-ai-consumer-cleanup) |
| **Part 1.5** | Pass H ✅ · **Pass H2a** ✅ · H2b–H2d — plan below |
| **Part 2** | Flow locomotion 2a → 2b → 3 — **H2a gate cleared** |

---

## Read this first — hygiene law

**Every pass on this plan is a deletion pass dressed as cleanup.** Pick one dialect, one write site, one factory per duplicated concept. Net **negative** line count. If the diff adds layers, getters, barrels, or copy-paste with a new filename — **stop**.

**Tests migrate with the dialect — same PR, no shims.** When a handle or API is deleted (`blackboard`, `decisionSnapshot`, `ElevationCamera`, `getPropAsset`), **update every test in that PR**. Never leave production aliases, adapter wrappers, or dual-shape returns so old test imports keep working. Deprecated dialect in `Libraries/` because `tests/` still says `blackboard` is the same bug as keeping `px/py/zoom` in draw code because tests never got updated. If a test only asserts obsolete shape, **delete or rewrite the test** — do not preserve the obsolete shape in prod. See [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims).

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
- **`blackboard` + `decisionSnapshot` as sibling bags** (H2 — viewport/`ElevationCamera` class bug)
- **`facts.visible` / `facts.remembered` copies of `visibleWorld` / memory** — merge once into `known`
- **`readThreatState(world)` reading `blackboard ?? decisionSnapshot`** — one handle only
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
| **Compatibility shims / “thin aliases” so tests keep old imports or old object shape** | **Migrate tests in the same PR** — delete shim; see [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims) |
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
| Effort / hunt / food / ally cost | `decisionContext.reachSteps.*` (H2+) |
| Committed route beyond horizon | `decisionContext.routeStatus.pathLen` when committed target matches |
| Threat severity | `decisionContext.threatState` |
| Chosen mode / target | `decisionContext.chosenIntent` |
| Merged targets | `decisionContext.known.*` |
| Vision cone / nearest pick | Internal `distSq` in `classifyAgentVision` — **never exported** |

**H2 frozen dialect:** one handle `decisionContext` per tick — no `blackboard` + `decisionSnapshot` pair, no `facts.visible`/`facts.remembered` copies of `visibleWorld`.

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
- **Write site:** intent adapter only — `decisionContext.reachSteps` (was `facts.reachSteps` on blackboard)
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
| **Prod aliases for deprecated API “until tests catch up”** | Tests catch up **in the same PR** or the migration is not done |

### Extract rule (Part 1 dedupe)

- **OK when both consumers import:** `deriveThreatState`, `deriveAllyState`, `targetEvents` (incl. policy helpers), `createAgentIntentMemory`, `utilityScoring` (incl. hunger/flee scorers), `createGroundNavIntentAdapter`, `buildAgentDecisionContext`
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
- [ ] **No compatibility shims** — tests updated to new dialect in same PR; zero deprecated names in `Libraries/` **and** `tests/` when pass bar says so
- [ ] New file count justified — merge single-consumer helpers into owner module

---

## Part 1 — done (archive)

Snake/flee dedupe: generic derives, memory, perception, decision helpers, intent adapter shell. Full pass log, file ledger, Pass G gates, and honest verdict: [`history.md` § Part 1`](history.md#part-1-ai-consumer-cleanup).

---

## Part 1.5 — Pass H — unified decision engine ✅

**Shipped:** `Libraries/AI/agents/buildAgentDecisionContext.js` — blackboard skeleton, events, score loop, snapshot. Species files hold spec + scorers + hooks only.

| File | Lines | Role |
|------|------:|------|
| `buildAgentDecisionContext.js` | 93 | engine — `buildAgentDecisionFrame`, `pickAgentIntentPolicy`, `buildAgentDecisionContext` |
| `snakeDecisionModel.js` | 170 | spec + ally engagement hook + prey/food/ally scorers |
| `fleeDecisionModel.js` | 150 | spec + prey→enemy alias + flee/enemy/food/ally scorers |

**Tests:** 95 intent/decision suites green. Exports: `buildSnakeDecisionContext`, `buildSnakeDecisionFrame`, `buildFleeDecisionContext`, `buildFleeDecisionFrame`, score helpers.

**H2a done:** one flat `decisionContext` at adapter boundary — no `blackboard`/`decisionSnapshot`, no `facts.*` copies. **H2b–d remain:** slot schema + scorer registry in config; delete species model JS.

---

## Part 1.6 — Pass H2 — decision frame (viewport analog)

**Problem:** Pass H deduped the **pipeline** but not the **handle**. Today one tick produces:

```text
visibleWorld + memoryWorld + reachSteps          ← raw inputs (fine at boundary)
  → blackboard.facts.visible / remembered / known ← ElevationCamera copies
  → decisionSnapshot (threatState, chosenIntent…) ← wallPassCamera copy
  → world.{ blackboard, decisionSnapshot }       ← two handles threaded together
```

Effects read `world.blackboard.facts.known.threat`. Latch reads `world.decisionSnapshot.chosenIntent`. `readThreatState` does `blackboard ?? decisionSnapshot`. Flee latch **re-assigns** `decisionSnapshot.events = blackboard.events`. Species specs rebuild slots with `buildVisible` / `buildRemembered` / `buildKnown` — **`elevationCameraFromViewportInto` for AI**.

**Goal:** one `decisionContext` built once at the adapter perceive boundary. Species differences live in **`Config/games/snake.js`** (slot schema + mode/scorer table), not `*DecisionModel.js` scorer files.

### The rule (copy from [`../frame.md`](../frame.md))

```text
Pass decisionContext. Read decisionContext. Nothing else.
```

| Need | Read from |
|------|-----------|
| Merged target for mode | `decisionContext.known[ slot ]` |
| Path-step effort | `decisionContext.reachSteps[ slot ]` |
| Threat / hunger / ally derive | `decisionContext.threatState` etc. |
| Scores + pick | `decisionContext.candidateScores`, `.chosenIntent` |
| FSM / debug | same object — no sibling snapshot |
| Memory reason for policy | `decisionContext.memoryActive[ slot ]` or event already pushed — **not** a full `remembered` target copy |

Raw `visibleWorld` / `memoryWorld` exist **only** as inputs to the single build call inside `createGroundNavIntentAdapter` — never passed to scorers, effects, or latch.

### Forbidden after H2 (grep + smell)

| Banned | Viewport analog |
|--------|-----------------|
| `decisionSnapshot` as separate object | `wallPassCamera` |
| `blackboard.facts.visible` / `.remembered` | unpacking `px/py/zoom` at every draw entry |
| `buildVisible` / `buildRemembered` / `buildKnown` in species JS | `elevationCameraFrom*` factories |
| `readThreatState` fallback across two bags | resolver picking which camera copy |
| `snakeDecisionModel.js` / `fleeDecisionModel.js` with scorers | config at use site — **delete files in H2d** |
| Free-form scorer expressions in JSON | resolver theater — **named scorer IDs only** |
| **`buildSnakeDecisionContext` wrappers that rebuild `{ blackboard, decisionSnapshot }`** | test accommodation shim — **banned** |
| `Libraries/AI/decision/` package | unchanged ban |

### Target shape — one object

Built in `buildDecisionContext(spec, input)` (grow `buildAgentDecisionContext.js` or rename in place):

```javascript
decisionContext = {
  // merged decision frame (only read surface downstream)
  known: { threat, prey|enemy, food, ally, threatCount?, allyCount?, allyCentroid? },
  reachSteps: { threat, prey|enemy, food, ally },
  routeStatus, committedTarget,
  hungerState, threatState, allyState,
  events,
  candidateScores, candidateScoreDetails,
  chosenIntent, chosenReason, targetId,
  sprintIntent,
  // snake-only extras on same object — not a second bag
  engagementState?, seekerFaction?, seekerSegmentCount?,
  memoryActive: { threat?, prey?, … },  // booleans for policyReasonForTarget — not full target copies
}
```

Intent FSM `world` becomes `{ decisionContext }` (or `world.decisionContext` with `world` = context for minimal churn). **Delete** `{ blackboard, decisionSnapshot }` return pair.

### Config — species = data (`Config/games/snake.js`)

Two subtrees — same engine, different tables:

```javascript
// snake root
decision: {
  scoreOrder: ["flee", "seek_prey", "seek_food", "seek_ally", "explore"],
  reachSlots: { threat: "threat", prey: "prey", food: "food", ally: "ally" },
  targetLost: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
  policySlot: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },
  slots: {
    threat: { memory: "threat" },
    prey:   { memory: "prey" },
    food:   { memory: "food" },
    ally:   { memory: "ally", known: "engagedAlly" },  // hook id, not inline JS
  },
  modes: {
    flee:       { scorer: "riskAdjustedFlee" },
    seek_prey:  { scorer: "preyWithEffort", slot: "prey" },
    seek_food:  { scorer: "foodWithHunger", slot: "food" },
    seek_ally:  { scorer: "regroupAlly", slot: "ally", cohesion: "snake" },
    explore:    { scorer: "constant" },
  },
  sprint: { derive: "snake" },
  afterPick: "snakeEngagement",
  extraInputs: ["seekerFaction", "seekerSegmentCount", "session"],
},

// fleeAgent.decision — same keys, different values
fleeAgent: {
  decision: {
    scoreOrder: ["flee", "seek_enemy", "seek_food", "seek_ally", "explore"],
    reachSlots: { threat: "threat", enemy: "enemy", food: "food", ally: "ally" },
    slots: {
      threat: { memory: "threat" },
      enemy:  { memory: "prey", visibleFrom: "prey", hideVisibleWhenMemory: true },
      food:   { memory: "food" },
      ally:   { memory: "ally", hideVisibleWhenMemory: true },
    },
    modes: {
      flee:       { scorer: "riskAdjustedFlee", mods: ["outnumberedFlee"] },
      seek_enemy: { scorer: "reachTarget", slot: "enemy", guards: ["noThreat"] },
      seek_food:  { scorer: "foodWithHunger", slot: "food", guards: ["notSatisfied"], mods: ["sprintFoodPenalty"] },
      seek_ally:  { scorer: "regroupAlly", slot: "ally", cohesion: "flee" },
      explore:    { scorer: "constant" },
    },
    sprint: { derive: "flee" },
    snapshotExtra: ["enemy"],  // expose known.enemy on context for tests/debug
  },
}
```

**Not a scoring DSL:** `modes.*.scorer` must be one of a **fixed registry** in the engine (`riskAdjustedFlee`, `reachTarget`, `preyWithEffort`, `foodWithHunger`, `regroupAlly`, `constant`). `guards` / `mods` are a closed enum — new behavior = new named primitive in engine, not inline config logic.

### Engine work (`buildAgentDecisionContext.js`)

| Add / change | Detail |
|--------------|--------|
| `mergeSlotsFromSchema(slots, visibleWorld, memoryWorld, hooks)` | replaces `buildVisible` / `buildRemembered` / `buildKnown` closures |
| `knownHooks.engagedAlly` | snake ally filter (`resolveKnownAlly` logic) |
| `scorerRegistry` | named functions; read `decisionContext` only |
| `deriveHungerFromConfig(foodFraction, hungerConfig)` | deletes duplicate snake/flee hunger functions |
| `deriveSprintFromConfig(mode, …, sprintTable)` | deletes duplicate sprint functions |
| `buildDecisionContext(decisionConfig, input)` | single return — no `{ blackboard, decisionSnapshot }` |
| `afterPick` hook table | `{ snakeEngagement }` — one function, referenced by id from config |

**Delete from engine:** `createAgentDecisionBlackboard` as public API; species `spec` objects with inline closures.

### Species files after H2

| File | After |
|------|-------|
| `snakeDecisionModel.js` | **Deleted** in H2d — no re-exports |
| `fleeDecisionModel.js` | **Deleted** in H2d — no re-exports |
| `Config/games/snake.js` | owns both `decision` tables |
| Tests | import `buildDecisionContext` + config; assert `decisionContext` shape only |

### Migration steps — one PR per step, tests green each time

#### H2a — Collapse the frame ✅

**Shipped 2026-06-23:** `buildAgentDecisionContext` returns flat `decisionContext`; adapter `world = { decisionContext }`; deleted `blackboard`/`decisionSnapshot`/`readThreatState`; `getDecisionContext()` replaces `getDecisionSnapshot()`; tests use `buildSnakeDecisionFrame` / `buildFleeDecisionFrame` (no `createSnakeDecisionBlackboard`). 95 intent/decision tests green; grep clean in `Libraries/` + `tests/`.

**Bar:** one object; no sync between siblings; **tests and prod on `decisionContext` in the same PR** — no interim aliases.

1. `buildAgentDecisionContext` → returns flat **`decisionContext`** only (drop `facts.visible`/`facts.remembered`; add `memoryActive` flags for policy reasons).
2. `createGroundNavIntentAdapter`: `world = { decisionContext }`; delete `lastBlackboard` / `lastDecisionSnapshot` split — one `lastDecisionContext`.
3. Replace **all** reads in `Libraries/` and `tests/`:
   - `blackboard.facts.known.*` / `decisionSnapshot.*` → `decisionContext.*`
   - delete `readThreatState` — `decisionContext.threatState` only
   - delete `decisionSnapshot.events = blackboard.events`
4. Update tests that import `createSnakeDecisionBlackboard`, `pickSnakeIntentPolicy`, `buildSnakeDecisionContext`, etc. to use `decisionContext` helpers or call sites on the adapter — **rewrite assertions**, do not wrap old shape.
5. Delete deprecated exports (`createSnakeDecisionBlackboard`, `{ blackboard, decisionSnapshot }` return) in this PR — not a follow-up.

**Forbidden in H2a:** `buildSnakeDecisionContext` returning a fake `{ blackboard, decisionSnapshot }` bag; grep exceptions for `tests/`; “land prod first, fix tests in H2d”.

**Touches:** `buildAgentDecisionContext.js`, `createGroundNavIntentAdapter.js`, `createSnakeForageIntent.js`, `createFleeExploreIntent.js`, `resolveFleePackOptions.js`, `snakeDecisionModel.js`, `fleeDecisionModel.js`, **all** tests under `tests/*Decision*`, `tests/*Intent*`, `tests/agentAlly*`, `tests/snakeEngagement*`, `tests/fleePack*`, debug overlays.

**Grep gate (Libraries + tests — zero hits):**

```bash
rg 'decisionSnapshot|blackboard\.facts|createSnakeDecisionBlackboard|createFleeDecisionBlackboard' --glob '*.js'
rg 'readThreatState' --glob '*.js'
rg '\{ blackboard, decisionSnapshot \}' --glob '*.js'
```

#### H2b — Slot schema from config

**Bar:** no `buildVisible` / `buildRemembered` / `buildKnown` in JS species files.

1. Move slot tables into `Config/games/snake.js` (both snake + fleeAgent.decision).
2. Engine `mergeSlotsFromSchema` implements: memory gating, flee `enemy`←`prey` alias, hide-visible-when-memory, snake `engagedAlly`.
3. Delete spec closure blocks from decision model files.

#### H2c — Scorer registry + mode table

**Bar:** no species-local `scorePreyDetail` / `scoreSeekAllyDetail` functions.

1. Implement registry entries by **lifting** current snake/flee scorers into engine (parameterized by config path / cohesion id).
2. `buildDecisionContext` loops `decisionConfig.modes` → registry — no species `scoreDetails` function.
3. Hunger/sprint derive from config tables.

#### H2d — Delete species decision models

**Bar:** config + engine only.

1. **Delete** `snakeDecisionModel.js` and `fleeDecisionModel.js`.
2. Adapter calls `buildDecisionContext(getSnakeGameConfig().decision, input)` / `fleeAgent.decision` directly.
3. Tests import `buildDecisionContext` from engine + config — no deleted filenames, no wrapper exports.
4. Update `fsmbfs.md` / `history.md`; add decision-frame case history to [`../stupid.md`](../stupid.md).

### Dependency

```text
Pass H ✅ ──► H2a collapse frame ──► H2b slot config ──► H2c scorer registry ──► H2d delete species models
                                                                                      │
Part 2 (flow locomotion) ◄──────────────────────────── gated on H2a minimum ──────────┘
```

Part 2 steering may read `decisionContext.known.threat` — must not introduce a third bag.

### Pass H2 review bar

- [x] One `decisionContext` per tick — no `decisionSnapshot` sibling (H2a)
- [x] No `facts.visible` / `facts.remembered` target copies — flat `known` + `memoryActive` (H2a)
- [x] Tests migrated same PR — no prod shims (H2a)
- [ ] Raw `visibleWorld` not passed past adapter build boundary
- [ ] Species tables in `Config/games/snake.js`; no scorer functions in game JS
- [ ] Scorer registry — named IDs only, no expression DSL
- [ ] No `Libraries/AI/decision/` · net negative LOC vs post-H
- [x] 95 intent/decision tests green (H2a)
- [ ] Phase 1 reach grep gates still clean

### Verify after ship

```bash
rg 'decisionSnapshot|blackboard\.facts' --glob '*.js'
rg 'createSnakeDecisionBlackboard|buildSnakeDecisionContext|buildFleeDecisionContext' tests --glob '*.js'  # after H2d: zero snakeDecisionModel imports
rg 'buildVisible|buildRemembered|buildKnown' Libraries/Game/snake --glob '*Decision*.js'
rg 'function scorePreyDetail|function scoreSeekAllyDetail|function scoreEnemyDetail' Libraries/Game/snake
rg 'Libraries/AI/decision' --glob '*.js'
```

---

## Part 2 — Flow locomotion (gated on H2a)

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
Part 1 (Pass G) ✅ ──► H2 decision frame ──► Part 2 flow (2a → 2b → 3)
                         H2a minimum gates Part 2
```

Cross-doc: [`../../pathfinding.md`](../../pathfinding.md) Tier 3 · `flowGroundNavBehavior.js`, `cellTargetHpaNav.js`

---

## Review bar

### Part 1

- [x] Passes A–G — see [`history.md`](history.md#part-1-ai-consumer-cleanup)
- [x] Pass G grep gates (2026-06-23 — clean on disk; 75 intent/decision tests)
- [x] Consolidation backlog — 8 micro-files merged (see history)

### Part 1.5 (Pass H)

- [x] One `buildAgentDecisionContext` engine file (93 lines)
- [x] Species spec + scorers; pipeline deduped — no framework folder / scoring DSL
- [x] Both `buildSnakeDecisionContext` and `buildFleeDecisionContext` exported
- [x] 91 intent/decision tests green

### Part 1.6 (Pass H2 — decision frame)

- [x] H2a: one `decisionContext`; tests migrated same PR; zero `blackboard`/`decisionSnapshot` in Libraries and tests
- [ ] H2b: slot merge from `Config/games/snake.js`
- [ ] H2c: scorer registry + mode table; hunger/sprint from config
- [ ] H2d: delete species `*DecisionModel.js` scorers (config + engine only)
- [ ] Grep gates above; 91+ tests green

### Part 2 (gated on H2a)

- [ ] 2a: flee steers from flow sample
- [ ] 2b: snake seek HPA waypoint + local flow
- [ ] 3: blended fields; no `pickFleeCell` in flee
- [ ] Decision reach still `navReachHorizon` only
