# FSM roadmap — reach, decision engine, flow locomotion

**Supersedes:** [`plan.md`](plan.md) · [`fsmbfs.md`](fsmbfs.md)  
**Archive detail:** [`history.md`](history.md) — pass logs, file ledger, grep recordings (content merged below; keep `history.md` in sync when shipping passes)

---

## Status

| | |
|--|--|
| **Phase 1** | Reach dialect (`reachSteps`) ✅ — [Archive § Phase 1](#phase-1--reachsteps) |
| **Part 1** | Passes A–G ✅ — [Archive § Part 1](#part-1--ai-consumer-cleanup) |
| **Part 1.5** | Pass H — unified decision engine ✅ |
| **Part 1.6** | Pass H2a collapse frame ✅ · **H2b–H2d** — plan below |
| **Part 0** | Pre-BFS cleanup & allocation — **next, gates Part 2** |
| **Part 2** | Flow locomotion 2a → 2b → 3 — **gated on H2a minimum** (cleared) |

**Execution order:**

```text
Phase 1 ✅ ──► Part 1 ✅ ──► Pass H ✅ ──► H2a ✅ ──► Part 0 (cleanup/hoists) ──► H2b ──► H2c ──► H2d ──► Part 2 (flow)
```

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
| [`../crypto.md`](../crypto.md) | Hash/PRNG dedupe; int cache keys (LOS key ✅) |
| [`../../AI.md`](../../AI.md#future-local-flow-horizons) | Generic loop in `Libraries/AI`; species facts/scorers in game adapters |
| [`../../pathfinding.md`](../../pathfinding.md) | Flow infra detail; HPA + flow hybrid notes for Part 2 |

### What “passthrough” means here

A function, object, param, or layer that exists **only to forward data the caller already has**. In this plan that includes:

- Copying distance/target fields perception → memory → blackboard → scorer (Tier 1b — **dead**, see [Archive](#phase-1--reachsteps))
- Threading `reachSteps` through memory enrich instead of computing once at intent adapter
- `buildNavReachHorizon()` → `{ stepsTo }` closure every agent
- `buildSnakeDecisionContext` / `buildFleeDecisionContext` wrappers that add no logic
- Threading the same config through 3 functions when `getSnakeGameConfig()` at the read site works
- Factory that returns one closure and nothing else
- Second blackboard layer (`visible.*Dist`, `remembered.*Dist`, `known.*Dist`) for the same fact
- **`blackboard` + `decisionSnapshot` as sibling bags** (H2 — viewport/`ElevationCamera` class bug) — **deleted H2a**
- **`facts.visible` / `facts.remembered` copies of `visibleWorld` / memory** — merge once into `known`
- **`readThreatState(world)` reading `blackboard ?? decisionSnapshot`** — one handle only — **deleted H2a**
- **One-export micro-files** whose only caller is another module in the same PR (inline or merge — see [Part 1 verdict](#part-1--verdict))

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
| Pre-bake `fleeRangeCells` on config via boot resolver | Inline `Math.ceil` in threat derive ([history](#phase-1--reachsteps)) |
| `checkReachability` on flow types for decisions | Deleted — use `navReachHorizon.js` |
| Per-agent `FlowFieldWindow` for **utility scoring** | Sync BFS for decisions; flow windows **Part 2 locomotion only** |
| Mock `{ stepsTo: () => N }` in tests | Real `syncNavReachHorizon` or stub `reachSteps` on context |
| **Compatibility shims / “thin aliases” so tests keep old imports or old object shape** | **Migrate tests in the same PR** — delete shim; see [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims) |
| One-export barrels (`import from "../AI/foo/index.js"`) | Import owning module directly |
| Pass F-style file sprawl (5 helpers × 1 consumer) | Merge into the factory file that owns the call site |

### Normalization rules (this plan)

```text
One distance for AI decisions: reachSteps (nav path steps) — FROZEN, see Phase 1 archive.
Perception and memory: targets only — never distance.
One factory per duplicated concept (memory, perception options, intent adapter shell).
One threat derive, one ally derive — species-neutral names in Libraries/AI.
Flee must not import generic code from snakeDecisionModel.js.
Prefer fewer files over “perfect” folder purity when only one caller exists.
```

| Need | Read from |
|------|-----------|
| Effort / hunt / food / ally cost | `decisionContext.reachSteps.*` |
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

### Extract rule (Part 1 dedupe)

- **OK when both consumers import:** `deriveThreatState`, `deriveAllyState`, `targetEvents` (incl. policy helpers), `createAgentIntentMemory`, `utilityScoring` (incl. hunger/flee scorers), `createGroundNavIntentAdapter`, `buildAgentDecisionContext`
- **Merged:** Pass F micro-files inlined into adapter / `targetEvents` / `utilityScoring` — see [consolidation backlog](#consolidation-backlog--merged)
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

## Part 0 — Pre-BFS cleanup & allocation (do before Part 2)

**Goal:** Kill remaining per-tick allocations and duplicate snake/flee spec boilerplate **before** flow locomotion. Aligns with H2b–H2c (slot merge + scorer registry) — do hoists here or fold into those passes; do not ship Part 2 until hot-path alloc bar is met.

### 0.0 — Already shipped (adjacent wins)

| Win | Where | Notes |
|-----|-------|-------|
| `EMPTY_AGENT_REACH_STEPS` | `buildAgentDecisionContext.js` | Shared frozen default; `reachSteps ?? EMPTY_AGENT_REACH_STEPS` |
| LOS cache int key | `gridCellVisionSession.js` | `gridCellLosCacheKey` → `mixHash4(packCellKey(...), …)`; `Map<number, boolean>` |
| Query result buffer pooling | `EntityRegistry.js` | Registry-owned query buffers — see [`../normalization.md`](../normalization.md) |
| Filter query int hash | `EntityRegistry.js` | `filterQueryHash()` replaces string `filterKey` + `hashString` |
| `hashSaltString` (crypto P1) | `Libraries/Math/hash.js` | Unifies salt loops — see [`../crypto.md`](../crypto.md) |

### 0.1 — Hot-path allocation wins (non-decision + decision)

#### 1. Stop building a nav graph view inside LOS

**File:** `Libraries/Navigation/gridCellVision.js` → `hasGridCellLineOfSight`

**Today:** `createNavGraphViewFromTopology(navTopology)` allocates a fresh `{ grid, canStep, isBlocked, … }` object every LOS check, even when the boolean result is cached.

**Fix:** Call `navCanStep` / topology fields directly in the Bresenham loop — no wrapper object.

**Kills:** one object + closures per vision ray.

#### 2. `tickKineticSleep` `new Set()`

**File:** `Libraries/Physics/kineticPhysicsPass.js:16`

**Today:** Brand-new `Set` every physics tick for island sleep walks.

**Fix:** Module `Uint8Array visited` stamped by tick gen (same pattern as wall buckets).

**Kills:** one `Set` per tick, guaranteed.

#### 3. `netScoreDetail` return object

**File:** `Libraries/AI/agents/utilityScoring.js:4`

**Today:** `{ value, reach, cost, net }` × 4–5 modes per `scoreSnakeIntentCandidateDetails` call (× flee model too).

**Fix:** `netScoreDetailInto(scratch, …)` or score straight to `Float32Array[5]` on the decision context — pick only needs `net`.

**Kills:** ~5 objects per snake per tick (~10 with flee).

### 0.2 — Agent layer hoists (`Libraries/AI/agents/`)

Same layer as `EMPTY_AGENT_REACH_STEPS`. Species files keep weights, thresholds, and snake-only ally engagement — not another copy of “remembered food if `memorySource.food`”.

#### Tier 1 — Same logic copy-pasted in snake + flee specs

| # | Hoist | Detail |
|---|-------|--------|
| **1** | `deriveAgentHungerState(foodFraction, { satisfiedAtOrAbove, desperateBelow })` | Snake and flee `derive*HungerState` are the same 6 lines; only config path differs. New file `deriveAgentHungerState.js`; species pass config slice from `getSnakeGameConfig()` / `fleeAgent.hunger`. |
| **2** | `buildAgentRemembered(memoryWorld, memorySource, slots)` | Both `buildRemembered` blocks are the same `memorySource?.X ? memoryWorld?.X : null` loop over `{ threat, prey/enemy, food, ally }`. Spec declares slot names; agent builds the object once. |
| **3** | `buildAgentEventTargets(visibleWorld, remembered, slots)` | Both specs return the same `{ kind, visibleTarget, rememberedTarget }[]` with different slot names. One helper; spec passes `[["threat","threat"], ["prey","prey"], …]`. |
| **4** | Drop redundant `policySlot` | In both specs `policySlot` is identical to `targetLost` (`seek_food → food`, etc.). `pickAgentIntentPolicy` can read `spec.targetLost[mode]` directly — drop half the spec surface. |

#### Tier 2 — Scoring / allocation (agent utility layer)

| # | Hoist | Detail |
|---|-------|--------|
| **5** | `SCORE_ABSENT` + `exploreScoreDetail(weights)` | Both models return `{ net: -Infinity }` ~10× per score pass and identical `explore: { value, reach: null, cost: 0, net: weights.explore }`. Hoist frozen sentinel + one explore template in `utilityScoring.js` (like reach steps). |
| **6** | `netScoreDetailInto(scratch, …)` or flat score buffer | Overlaps **0.1 #3** — every food/prey/ally/enemy score allocates `{ value, reach, cost, net }`. Agent tick writes into module scratch or `Float32Array[scoreOrder.length]`; only expose `net` to `pickBestScoreKey`. |
| **7** | Shared `scoreFoodDetail` / `scoreSeekAllyDetail` with config hooks | Food scoring nearly identical (flee adds “satisfied → absent” + sprint penalty). Ally scoring same shape (threat blocks, cohesion bonus, idealStopDist). One agent helper + species config — biggest line-count win in decision models. Maps to **H2c** scorer registry lift. |

#### Tier 3 — Frame builders / visible→known pipeline

| # | Hoist | Detail |
|---|-------|--------|
| **8** | `buildAgentKnown(visible, remembered, visibleWorld, { preyKey, allyResolver? })` | Default merge is `visibleWorld.X ?? remembered.X` for threat/food; prey/enemy/ally differ slightly (snake has `resolveKnownAlly` + engagement). Hoist common merge; snake keeps thin `allyResolver` hook. Maps to **H2b** `mergeSlotsFromSchema`. |
| **9** | `buildAgentVisible(visibleWorld, memorySource, options)` | Flee gates prey/ally on `memorySource`; snake copies straight from `visibleWorld`. One function with `{ gatePreyOnMemory, gateAllyOnMemory }` kills both `buildVisible` lambdas. Maps to **H2b**. |
| **10** | Drop `buildSnakeDecisionFrame` from public surface | Re-derives hunger/threat then calls `buildAgentDecisionFrame` — already what `buildAgentDecisionContext` does. Tests use `buildSnakeDecisionContext` or call agent frame builder with test input bag. Not a hoist — removes spec-level indirection. |

#### Tier 4 — Smaller constants / defaults in agent

| # | Hoist | Detail |
|---|-------|--------|
| **11** | `DEFAULT_AGENT_CELL_SIZE = 16` | Used in `deriveThreatState(..., input.cellSize ?? 16, ...)`. One named constant in agent layer. |
| **12** | Shared sprint intent skeleton | `deriveSprintIntent` / `deriveFleeSprintIntent` share “flee + severe threat → sprint escape”, “seek_food + threat + desperate → sprint”. `deriveAgentSprintIntent(mode, threatState, hungerState, sprintConfig)` with species config. Maps to **H2c** `deriveSprintFromConfig`. |
| **13** | `scoreCandidateSet` output reuse | `candidateScores = {}` fresh object every tick. Reuse frozen-empty + mutate known keys, or parallel arrays indexed by `scoreOrder`. |

### 0.3 — What should **not** move to agent

- **Snake-only:** `resolveKnownAlly`, `deriveSnakeEngagementState`, prey faction logic, segment-count regroup — stay in `snakeDecisionModel.js` until **H2d** delete
- **Flee-only:** `scoreFlee` outnumbered multiplier, `seek_enemy` naming — stay in flee adapter until **H2c** registry
- **`getSnakeGameConfig()` reads** — stay at use site per hygiene rules; agent helpers take **config slices**, not resolvers

### 0.4 — Recommended execution order

```text
0.1 #1 LOS nav graph view          (vision hot path — independent)
0.1 #2 kinetic sleep visited stamp (physics hot path — independent)
Tier 1 hoists #1–4                 (trivial; unblocks H2b slot merge)
Tier 2 #5 SCORE_ABSENT + explore   (quick alloc win before #6)
0.1 #3 / Tier 2 #6 netScoreDetail  (biggest decision-tick GC win)
Tier 2 #7 + Tier 3 #8–9            (fold into H2b–H2c PRs)
Tier 4 + #10                       (during H2c–H2d)
```

**If you only do three more hoists:**

1. `deriveAgentHungerState` — trivial, zero behavioral risk
2. `buildAgentRemembered` + `buildAgentEventTargets` — kills the most spec boilerplate
3. `SCORE_ABSENT` + shared explore detail — kills the most per-tick `{ net: … }` garbage in scoring

Agent layer becomes the **memory/scoring dialect**, the way `EMPTY_AGENT_REACH_STEPS` is now the **reach dialect**.

### Part 0 review bar

- [ ] LOS checks do not allocate nav graph view objects
- [ ] Physics sleep walk uses stamped `Uint8Array`, not `new Set()` per tick
- [ ] Decision scoring does not allocate per-mode detail objects (or ≤1 scratch reused)
- [ ] Snake + flee both import every new agent helper in the same PR
- [ ] Net negative LOC vs current `*DecisionModel.js` + `utilityScoring.js`
- [ ] Phase 1 reach grep gates still clean (below)

---

## Frozen — decision reach (Phase 1, do not regress)

Authoritative pass log: [Archive § Phase 1](#phase-1--reachsteps).

- **Module:** `Libraries/Navigation/navReachHorizon.js` only for decision reach BFS
- **Write site:** intent adapter only — `decisionContext.reachSteps` (was `facts.reachSteps` on blackboard pre-H2a)
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
| Flow window / worker for utility reach | Wrong tool; async; Part 2 locomotion only |
| Extract shared module in PR that only updates snake | Flee must import in **same PR** |
| New folder with one consumer | Wait for two importers or inline |
| Copy-paste helper to “shared” file without deleting both copies | Net LOC must drop |
| Generic slot pipeline / BT layer | Deferred — not this plan |
| **Prod aliases for deprecated API “until tests catch up”** | Tests catch up **in the same PR** or the migration is not done |

---

## Part 1 — done (archive summary)

Snake/flee dedupe: generic derives, memory, perception, decision helpers, intent adapter shell. Full pass log, file ledger, Pass G gates, and honest verdict: [Archive § Part 1](#part-1--ai-consumer-cleanup).

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

**Problem:** Pass H deduped the **pipeline** but not the **handle**. Pre-H2a one tick produced:

```text
visibleWorld + memoryWorld + reachSteps          ← raw inputs (fine at boundary)
  → blackboard.facts.visible / remembered / known ← ElevationCamera copies
  → decisionSnapshot (threatState, chosenIntent…) ← wallPassCamera copy
  → world.{ blackboard, decisionSnapshot }       ← two handles threaded together
```

Effects read `world.blackboard.facts.known.threat`. Latch read `world.decisionSnapshot.chosenIntent`. `readThreatState` did `blackboard ?? decisionSnapshot`. Flee latch **re-assigned** `decisionSnapshot.events = blackboard.events`. Species specs rebuilt slots with `buildVisible` / `buildRemembered` / `buildKnown` — **`elevationCameraFromViewportInto` for AI**.

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
  policySlot: { seek_prey: "prey", seek_food: "food", seek_ally: "ally" },  // delete when H2 reads targetLost only
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
| `mergeSlotsFromSchema(slots, visibleWorld, memoryWorld, hooks)` | replaces `buildVisible` / `buildRemembered` / `buildKnown` closures — overlaps **Part 0 Tier 3 #8–9** |
| `knownHooks.engagedAlly` | snake ally filter (`resolveKnownAlly` logic) |
| `scorerRegistry` | named functions; read `decisionContext` only — overlaps **Part 0 Tier 2 #7** |
| `deriveHungerFromConfig(foodFraction, hungerConfig)` | deletes duplicate snake/flee hunger functions — overlaps **Part 0 Tier 1 #1** |
| `deriveSprintFromConfig(mode, …, sprintTable)` | deletes duplicate sprint functions — overlaps **Part 0 Tier 4 #12** |
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

1. Move slot tables into `Config/games/snake.js` (both snake + `fleeAgent.decision`).
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
4. Update `fsmroadmap.md` / `history.md`; add decision-frame case history to [`../stupid.md`](../stupid.md).

### Dependency

```text
Pass H ✅ ──► H2a collapse frame ✅ ──► Part 0 cleanup ──► H2b slot config ──► H2c scorer registry ──► H2d delete species models
                                                                                                              │
Part 2 (flow locomotion) ◄──────────────────────────── gated on H2a minimum ──────────────────────────────────┘
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
- [ ] Part 0 allocation bar met

### Verify after ship

```bash
rg 'decisionSnapshot|blackboard\.facts' --glob '*.js'
rg 'createSnakeDecisionBlackboard|buildSnakeDecisionContext|buildFleeDecisionContext' tests --glob '*.js'  # after H2d: zero snakeDecisionModel imports
rg 'buildVisible|buildRemembered|buildKnown' Libraries/Game/snake --glob '*Decision*.js'
rg 'function scorePreyDetail|function scoreSeekAllyDetail|function scoreEnemyDetail' Libraries/Game/snake
rg 'Libraries/AI/decision' --glob '*.js'
rg 'createNavGraphViewFromTopology' Libraries/Navigation/gridCellVision.js  # after Part 0.1 #1: zero in LOS hot path
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
Part 1 (Pass G) ✅ ──► H2 decision frame ──► Part 0 cleanup ──► Part 2 flow (2a → 2b → 3)
                         H2a minimum gates Part 2
```

Cross-doc: [`../../pathfinding.md`](../../pathfinding.md) Tier 3 · `flowGroundNavBehavior.js`, `cellTargetHpaNav.js`

---

## Review bar (consolidated)

### Phase 1 — reachSteps ✅

- [x] One reach dialect everywhere in scoring/threat/cohesion
- [x] Perception + memory: targets only
- [x] Module scratch sync/lookup — no returned horizon objects
- [x] Reach once per agent at intent adapter
- [x] No `Libraries/AI/decision/` package or resolver getters
- [x] No `*Dist` grep hits in `Libraries/`
- [x] Net line count negative (phase 1 scope)
- [x] `checkReachability` deleted from flow types

### Part 1 ✅

- [x] Passes A–G — see [Archive](#part-1--ai-consumer-cleanup)
- [x] Pass G grep gates (2026-06-23 — clean on disk; 75 intent/decision tests)
- [x] Consolidation backlog — 8 micro-files merged (see history)

### Part 1.5 (Pass H) ✅

- [x] One `buildAgentDecisionContext` engine file (93 lines)
- [x] Species spec + scorers; pipeline deduped — no framework folder / scoring DSL
- [x] Both `buildSnakeDecisionContext` and `buildFleeDecisionContext` exported
- [x] 91+ intent/decision tests green

### Part 1.6 (Pass H2 — decision frame)

- [x] H2a: one `decisionContext`; tests migrated same PR; zero `blackboard`/`decisionSnapshot` in Libraries and tests
- [ ] H2b: slot merge from `Config/games/snake.js`
- [ ] H2c: scorer registry + mode table; hunger/sprint from config
- [ ] H2d: delete species `*DecisionModel.js` scorers (config + engine only)
- [ ] Grep gates above; 95+ tests green

### Part 0 (pre-BFS cleanup)

- [ ] LOS nav graph view allocation eliminated
- [ ] Kinetic sleep `Set` eliminated
- [ ] `netScoreDetail` per-mode object churn eliminated or scratch-reused
- [ ] Agent hoists Tier 1–4 (or folded into H2b–H2c with same bar)

### Part 2 (gated on H2a)

- [ ] 2a: flee steers from flow sample
- [ ] 2b: snake seek HPA waypoint + local flow
- [ ] 3: blended fields; no `pickFleeCell` in flee
- [ ] Decision reach still `navReachHorizon` only

---

# Archive — shipped work (from `history.md`)

*Historical dialect notes below use pre-H2a names where they document what was deleted.*

---

## Phase 1 — `reachSteps`

**Status:** complete ✅ (Passes 1–5)

**Goal (achieved):** Delete every exported distance field and replace with **one dialect**: **`reachSteps`** — octile nav path steps on `NavTopology`.

**Supersedes:** “wire `FlowFieldWindow.checkReachability` for utility scorers” in [`../../AI.md`](../../AI.md#future-local-flow-horizons). Decision reach = **`navReachHorizon.js`** only.

### What we deleted (passthrough + duplicate dialect)

```text
classifyAgentVision *Dist  ──copy──►  intentMemory enrich *Dist  ──copy──►  blackboard known.*Dist  ──read──►  reachForCandidate
targetMemory lastDistanceCells ───────────────────────────────────────────────────────────────────────────►  same chain
```

After: perception/memory hold **targets only**. Intent adapter runs `syncNavReachHorizon` once, fills `reachSteps` once, passes into `build*DecisionContext`. Scorers read `reachSteps.*` only (now `decisionContext.reachSteps.*` post-H2a).

### The rule (frozen — do not regress)

```text
One distance for AI decisions: reachSteps (nav path steps).
Perception and memory store targets only — never distance.
syncNavReachHorizon once per agent per decision tick; navReachStepsTo for lookups.
```

| Need | Read from |
|------|-----------|
| Effort cost in `netScoreDetail` | `decisionContext.reachSteps.{prey\|food\|ally\|threat\|enemy}` |
| Committed route (may exceed horizon) | `routeStatus.pathLen` when committed target matches — inline in intent adapter |
| Threat severity / lethal flee | `reachSteps.threat` + inline cell math from config + `cellSize` |
| Cohesion / pack distance | `reachSteps.ally` |
| Debug score breakdown | `candidateScoreDetails.*.reach` |
| Vision cone | Internal `distSq` in `classifyAgentVision` only — **never exported** |

### Problem (before phase 1)

| Layer | Field | What it actually was |
|-------|-------|---------------------|
| `classifyAgentVision.js` | `threatDist` | **World pixels** |
| same | `preyDist`, `allyDist` | Euclidean ÷ `cellSize` |
| `agentWorldPerception.js` | `foodDist` | Euclidean ÷ `cellSize` |
| `reachForCandidate` ×2 | `known.*Dist` fallback | Straight-line cells |
| same | committed branch | HPA `pathLen` — real steps |
| `targetMemory.js` | `lastDistanceCells` | Stale euclidean at observe time |
| `fleeIntentMemory.js` | remembered `threatDist` | **Pixels vs cells unit bug** |

Also removed: `aggregateThreatSeverity`, `reachForCandidate`, duplicated distance helpers. Deleted `FlowFieldWindow.checkReachability`, `FlowFieldGrid.checkReachability`.

### Shipped API

**File:** `Libraries/Navigation/navReachHorizon.js`

```javascript
syncNavReachHorizon(navTopology, startX, startY, maxSteps) → boolean
navReachStepsTo(worldX, worldY) → number | null
```

- Module scratch: `Int32Array distances`, `Uint32Array visitedGen`, `Int32Array queue`; generation stamp.
- BFS on `topology.octileNeighbors` + `topology.blocked` — same walkability as HPA.
- `gridReachabilityBfs.js` unchanged (flow cold path).

#### Module singleton contract

```text
For each agent that runs decision this tick:
  syncNavReachHorizon(nav, agent.x, agent.y, maxSteps)   // overwrites scratch
  navReachStepsTo(target.x, target.y)                    // read before next agent sync
```

**Never** hold a returned horizon object across agents. **Sync failure** → all lookups `null`; scorers treat null as unreachable. **No** euclidean `*Dist` fallback.

**Nav topology source:** `requireSnakeVisionFrame(state).navTopology` — read at sync site, no resolver.

#### Config

| Key | Where |
|-----|-------|
| `decisionReachHorizon: 32` | `Config/games/snake.js` |
| `fleeRange`, `lethalThreatRange`, `visionRange.range` | pixels → inline `Math.ceil` in threat derive |

### Blackboard shape (shipped pre-H2a; superseded by `decisionContext`)

**Perception:** `{ threat, prey, ally, food, threatCount, allyCount, allyCentroid }` — no `*Dist`.

**Memory:** `{ kind, id, x, y, cell, ageTicks, ttlTicks, confidence }` — no `lastDistance*`.

**Pre-H2a blackboard:**

```javascript
facts.known = { threat, prey, food, ally, … };   // flee: enemy not prey
facts.reachSteps = { threat, prey, food, ally }; // flee: enemy not prey
facts.routeStatus = { pathLen, hasRoute, … };
```

One write site for `reachSteps` in intent adapter — not mirrored into `visible` / `remembered` / `known` dist sub-records.

**Threat derive (inline cell math, no resolver):**

```javascript
export function deriveSnakeThreatState(visibleThreat, reachSteps, cellSize, config = getSnakeGameConfig()) {
    if (!visibleThreat || reachSteps == null) return null;
    const fleeRangeCells = Math.ceil((config.fleeRange ?? config.visionRange.range) / cellSize);
    const lethalThreatRangeCells = Math.ceil(config.lethalThreatRange / cellSize);
    const severity = Math.max(0, Math.min(1, (fleeRangeCells - reachSteps) / fleeRangeCells));
    return { dist: reachSteps, severity, lethal: reachSteps <= lethalThreatRangeCells };
}
```

*(Now `deriveThreatState` in `Libraries/AI/agents/` — species-neutral.)*

### Sight vs reach

| | Sight | Reach |
|---|-------|-------|
| Question | Who is in cone + LOS? | How many path steps to walk there? |
| Layer | `classifyAgentVision` internal `distSq` | `navReachHorizon` after sync |
| Exported? | **Targets only** | **`reachSteps.*` only** |

**Visible threat, no path within horizon:** `reachSteps.threat === null` → no severity flee (intentional).

### Intent adapter tick pipeline (reference)

```javascript
const nav = requireSnakeVisionFrame(state).navTopology;
syncNavReachHorizon(nav, agent.x, agent.y, config.decisionReachHorizon ?? 32);

function reachStepsForMode(target, mode) {
    if (!target) return null;
    if (committed?.mode === mode && committed.targetId === target.id) {
        const pathLen = routeStatus?.pathLen;
        if (Number.isFinite(pathLen)) return pathLen;
    }
    return navReachStepsTo(target.x, target.y);
}

const reachSteps = {
    threat: reachStepsForMode(known.threat, "flee"),
    prey: reachStepsForMode(known.prey, "seek_prey"),       // snake
    enemy: reachStepsForMode(known.enemy, "seek_enemy"),   // flee
    food: reachStepsForMode(known.food, "seek_food"),
    ally: reachStepsForMode(known.ally, "seek_ally"),
};
```

Snake: `reachSteps.prey`. Flee: `reachSteps.enemy`. Locomotion unchanged: `cellTargetHpaNav`, `pickFleeCell`.

### Passes 1–5

#### Pass 1 — Horizon primitive ✅

| Shipped | |
|---------|---|
| `Libraries/Navigation/navReachHorizon.js` | `syncNavReachHorizon`, `navReachStepsTo` |
| `Config/games/snake.js` | `decisionReachHorizon: 32` |
| `tests/navReachHorizon.test.js` | sync/lookup; edit staleness |

#### Pass 2 — Skipped

`reachStepsForMode` inlined in intent adapters (Pass 4).

#### Pass 3 — Strip perception + memory distances ✅

| File | Change |
|------|--------|
| `classifyAgentVision.js` | deleted exported `*Dist`, `aggregateThreatSeverity` |
| `agentWorldPerception.js` | deleted all `*Dist` |
| `fleeWorldPerception.js` | delegate to `perceiveAgentWorld` |
| `targetMemory.js` | deleted `lastDistance*` |
| `snakeIntentMemory.js`, `fleeIntentMemory.js` | no dist synthesis on enrich |

#### Pass 4 — Wire reach into live decisions ✅

| File | Work |
|------|------|
| `createSnakeForageIntent.js`, `createFleeExploreIntent.js` | sync/lookup; `reachStepsForMode`; pass `reachSteps` |
| `snakeDecisionModel.js`, `fleeDecisionModel.js` | `facts.reachSteps.*`; delete `reachForCandidate`; `routeEvents` exported (partial dedupe) |

#### Pass 5 — Grep gate + doc sync ✅

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps' --glob '*.js'
rg 'Libraries/AI/decision' --glob '*.js'
rg 'checkReachability' --glob '*.js'
```

All zero hits in `*.js`. Deleted flow `checkReachability`.

### Banned (phase 1 — still in force)

| Banned | Why |
|--------|-----|
| `buildNavReachHorizon()` → `{ stepsTo }` | Fake mini-service |
| `Libraries/AI/decision/*` package | Barrel sprawl |
| `resolveSnakeReachConfig()` / `resolve*Reach*` getters | Boot getter theater |
| Per-agent `FlowFieldWindow` for **scoring** | Wrong tool; async |
| Threading `reachSteps` through memory enrich | Passthrough |
| Reintroducing `*Dist` / `reachForCandidate` | Duplicate dialect |
| Mock `{ stepsTo: () => N }` in tests | Test real module |

---

## Part 1 — AI consumer cleanup

**Status:** Passes A–G complete ✅

**Why:** Phase 1 fixed reach dialect; snake and flee were still copy-paste forks (decision models, memory, perception, ~500-line twin intent adapters). Flee imported generic derives from `snakeDecisionModel.js`.

**Goal (achieved):** One shared module per duplicated concept; species files hold modes/scorers/blackboard shape only; flee imports `Libraries/AI/` not snake for generics.

### Part 1 — passes

| Pass | Work | Bar |
|------|------|-----|
| **A — Inventory** | Misnamed `agentRelationship.js` orphan (never wired; real registry is `AI/agents/agentPopulationRegistry.js`) | deleted Pass G |
| **B — Generic derives** | `deriveThreatState`, `deriveAllyState`, `targetEvents` → `Libraries/AI/`; deleted `deriveFleeAgentThreatState` | flee imports AI only |
| **C — Intent memory** | `createAgentIntentMemory.js`; deleted `snakeIntentMemory.js`, `fleeIntentMemory.js` | two call sites; snake `filterAllyForEngagement: true` |
| **D — Perception** | `agentIntentPerception.js`; deleted `snakeIntent.js`, `fleeWorldPerception.js` | one `perceiveAgentIntentWorld` |
| **E — Decision dedupe** | `intentPolicy.js`, `hungerEffort.js`, `scoreFleeIntent.js` | helpers out of both `*DecisionModel.js` |
| **F — Intent adapter** | `createGroundNavIntentAdapter.js` + reach/route/latch/effects helpers | species adapters ~100 lines each |
| **G — Gate** | grep + orphan cleanup + doc sync | all gates clean; 75 tests |

#### Pass G — gate run (2026-06-23)

**Orphan cleanup:** deleted `agentRelationship.js` (Pass A misname; zero importers — live registry is `Libraries/AI/agents/agentPopulationRegistry.js`). Pass C/D deletions (`snakeIntentMemory`, `fleeIntentMemory`, `snakeIntent`, `fleeWorldPerception`) already off disk.

**Grep gates** (zero hits in `Libraries/` on disk):

```text
preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate|aggregateThreatSeverity
buildNavReachHorizon|resolveSnakeReachConfig|resolveReachSteps|checkReachability
Libraries/AI/decision
from.*snakeDecisionModel in fleeAgent/
duplicate pushTargetEvents|policyReasonForTarget|intentPolicy in *DecisionModel.js
```

**Tests:** 75 pass — `snakeForageIntent`, `snakeDecisionModel`, `snakeIntent`, `fleeAgentDecision`, `agentAllyPerception`.

#### Pass D bugfix

`reachStepsForMode`: do not use committed `pathLen: 0` before a route exists. Trust path length only when `hasRoute && pathLen > 0`, or when `destReached`. Fixed regroup integration test (snake dropped `seek_ally` on second tick).

#### Stay in game adapters (by design)

Mode sets (`seek_prey` vs `seek_enemy`), engagement publish (snake), `regroupSizeFactor`, flee pack options, species blackboard builders, `policyForScoredMode` mode tables.

### Part 1 — file ledger

#### Deleted

| File | ~Lines |
|------|-------:|
| `snakeIntentMemory.js` | 61 |
| `fleeIntentMemory.js` | 53 |
| `snakeIntent.js` | 25 |
| `fleeWorldPerception.js` | 20 |
| `deriveFleeAgentThreatState` (wrapper) | — |
| `agentRelationship.js` | 8 (Pass G — orphan) |

#### Added (7 modules — after consolidation merge)

| Module | Consumers |
|--------|-----------|
| `AI/agents/deriveThreatState.js` | snake + flee decision |
| `AI/agents/deriveAllyState.js` | snake + flee decision |
| `AI/agentIntent/targetEvents.js` | snake + flee decision (+ policy helpers) |
| `AI/memory/createAgentIntentMemory.js` | snake + flee intent |
| `Game/snake/agentIntentPerception.js` | snake + flee intent |
| `Game/snake/agentReachSteps.js` | ground-nav adapter |
| `Game/snake/createGroundNavIntentAdapter.js` | snake + flee intent (+ inlined route/latch/effects/fsm) |

Also extended (not new files): `utilityScoring.js` — hunger effort + flee risk scorer.

#### Shrunk (representative)

| File | Before | After | Δ |
|------|-------:|------:|--:|
| `createSnakeForageIntent.js` | 268 | ~98 | −170 |
| `createFleeExploreIntent.js` | 235 | ~103 | −132 |
| `snakeDecisionModel.js` | 288 | ~230 | −58 |
| `fleeDecisionModel.js` | 221 | ~194 | −27 |

**Rough net:** ~550 lines removed from duplicates/deletions; **+7 new modules** (was +15 before merge); line count still ~−115 vs pre–Part 1.

### Part 1 — verdict

| Hygiene rule | Result |
|--------------|--------|
| Net negative LOC | **Marginal yes** (~−115) — not the big win phase 1 was |
| No passthrough layers | **Yes** — no resolver getters, no `{ stepsTo }` objects, no dist on memory |
| One factory per concept | **Yes** for memory, perception, adapter shell |
| Both consumers same PR | **Yes** for B–F extracts |
| Delete > add files | **Fixed post-merge** — +7 modules (was +15); 8 micro-files inlined |
| No framework folder | **Yes** — no `Libraries/AI/decision/` |

**What went well:** Real duplication gone. Flee no longer imports snake for generics. Twin ~500-line intent adapters collapsed to ~100-line species wiring. Reach dialect untouched. Tests green (99+ in intent/decision suites).

**What violated the spirit of hygiene (fixed):** Pass F initially split single-consumer helpers into separate files — merged back into `createGroundNavIntentAdapter.js`, `targetEvents.js`, and `utilityScoring.js`.

**Could have been worse:** No `createDecisionFramework`, no config resolver chain, no second reach dialect, no fake services. The adapter factory is one real factory, not a passthrough stack.

### Consolidation backlog — merged ✅

Reduced Part 1 file sprawl — **8 files deleted**, helpers folded into owners:

| Was | Now |
|-----|-----|
| `readAgentRouteStatus`, `createBrainArrivalStamper`, `createFleeIntentLatch`, `createCellTargetIntentEffects`, `getGroundNavFsmSnapshot` | private helpers + `getGroundNavFsmSnapshot` export in `createGroundNavIntentAdapter.js` |
| `intentPolicy.js` | `targetEvents.js` |
| `hungerEffort.js`, `scoreFleeIntent.js` | `utilityScoring.js` |

**Part 1 net modules after merge:** 7 added files — `deriveThreatState`, `deriveAllyState`, `targetEvents`, `createAgentIntentMemory`, `agentIntentPerception`, `agentReachSteps`, `createGroundNavIntentAdapter`.

**Pass H (+1 module):** `buildAgentDecisionContext.js` — both species import; species decision models hold spec + scorers only.

### Pass H — unified decision engine ✅

**Engine:** `Libraries/AI/agents/buildAgentDecisionContext.js` — `createAgentDecisionBlackboard(spec, input)`, `pickAgentIntentPolicy`, `buildAgentDecisionContext(spec, input)`.

**Species specs:**

| | Snake | Flee |
|--|-------|------|
| **Hook** | `resolveKnownAlly` + engagement `afterPick` | prey→`enemy` alias in visible/remembered/known |
| **Scorers** | prey, food, seek_ally (leadworthy + size factor) | flee (+ outnumbered), enemy, food, seek_ally |
| **Lines** | 170 (was 227) | 150 (was 191) |

**Tests:** 91 pass — snake/flee decision, intent, engagement, ally memory/metabolism.

**Bar met:** no `Libraries/AI/decision/` · no scoring DSL · one engine file · both consumers same PR.

### Pass H2a — collapse decision frame ✅

**Status:** complete (2026-06-23)

**Rule:** `Pass decisionContext. Read decisionContext. Nothing else.`

**Engine:** `buildAgentDecisionFrame(spec, input)` → flat frame (`known`, `remembered`, `reachSteps`, derived states, `events`). `buildAgentDecisionContext` returns one flat ctx with scores + `chosenIntent` — no `{ blackboard, decisionSnapshot }`.

**Adapter:** `createGroundNavIntentAdapter` sets `world = { decisionContext }`; `getDecisionContext()` replaces `getDecisionSnapshot()`; flee latch mutates `world.decisionContext` directly. Deleted `readThreatState`, `createSnakeDecisionBlackboard`, `createFleeDecisionBlackboard`.

**Tests:** 95 pass — migrated off `decisionSnapshot`, `blackboard.facts`, `createSnakeDecisionBlackboard`; frame-only tests use `buildSnakeDecisionFrame` / `buildFleeDecisionFrame`.

**Grep (Libraries + tests):** zero `decisionSnapshot`, `blackboard.facts`, `createSnakeDecisionBlackboard`, `readThreatState`, `getDecisionSnapshot`.

**Next:** H2b slot schema in `Config/games/snake.js` — see [Part 1.6](#part-16--pass-h2--decision-frame-viewport-analog).

### Part 1 — grep gates (Pass G) ✅

Recorded 2026-06-23 — see [Pass G gate run](#pass-g--gate-run-2026-06-23) above.

```bash
rg 'preyDist|foodDist|allyDist|threatDist|enemyDist|lastDistanceCells|reachForCandidate' --glob '*.js'
rg 'buildNavReachHorizon|resolveSnakeReachConfig|Libraries/AI/decision/' --glob '*.js'
rg "from.*snakeDecisionModel" Libraries/Game/snake/fleeAgent --glob '*.js'
rg "^function pushTargetEvents|^function policyReasonForTarget|^function intentPolicy" Libraries/Game/snake --glob '*DecisionModel.js'
```

All clean on disk in `Libraries/`.

### Part 1 review bar ✅

- [x] Flee does not import `snakeDecisionModel.js`
- [x] One intent memory factory
- [x] One perception entry (`agentIntentPerception.js`)
- [x] Decision policy/hunger/flee helpers shared
- [x] Intent adapter shell; species files ~100 lines
- [x] Pass G grep run recorded (2026-06-23)
- [x] Consolidation backlog merged (8 micro-files)

---

*Last updated: consolidated from `plan.md`, `fsmbfs.md`, `history.md` — Part 0 before Part 2; H2a shipped.*
