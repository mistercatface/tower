# Snake / flee / squid AI — what's left

One page for status. Goal: **one decision engine, one agent runtime, config-only new agents — zero duplicate species JS.**

Hygiene when touching this: [`hygiene.md`](hygiene.md) · [`stupid.md`](stupid.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md)

---

## Goal

**Decision layer (done):** Every tick an agent gets **one `decisionContext`**: merged targets, path-step reach, threat/hunger facts, scored modes, chosen intent, sprint intent. Snake, flee, and squid differ only in **`Config/games/snake.js`** intent/decision blocks — not parallel derive functions or adapter callbacks.

**Runtime layer (done):** Every agent is **one chain** (`AgentInstance` + `createAgentAutosim`) spawned via shared infrastructure. Profile config drives segment topology, metabolism, combat, relationships, and presentation. Adding agent #4 is a **`agentProfiles` block + spawn count** — not new Instance/Autosim/Metabolism/Species files and not N×N edits across combat and relationship matrices.

**Tests:** Migrate with the dialect in the same PR. No production aliases kept alive because tests still import `createFleeAgentInstance`, `SnakeInstance`, or harness-only factories.

---

## Hygiene law (binding before any step-6 PR)

From the four docs above — same rules that killed `ElevationCamera`, `blackboard`/`decisionSnapshot`, and `loadPropAssets`:

| Rule | Means for step 6 |
|------|------------------|
| **Deletion pass** | Net negative LOC. New file only if it replaces N deleted files and has no passthrough exports. |
| **One dialect** | One factory name, one config shape, one import path per concept. Zero `??` fallback between old and new field names in `Libraries/`. |
| **Tests migrate same PR** | Grep gate is **`Libraries/` + `tests/`** together. Prod alias so tests lag = same bug as keeping `px/py/zoom` beside `viewport`. |
| **No passthrough** | No `createSnakeAutosim` → `createAgentAutosim`, no 1-line re-export files, no `publishConfigCompatAliases` mirroring keys back to config root. |
| **Read at use site** | `getSnakeGameConfig()` / `getAgentProfile(profileId)` at the call site — no new `resolve*Gameplay` getters. |
| **Frame pattern for runtime** | Sync once at spawn/boundary (`applyAgentGameplay`, `spawnGameAgentChain`); don't re-apply per-species at every call site. |
| **Hot path (objects.md)** | Decision reach stays `navReachHorizon` generation-stamp BFS — flow windows are locomotion-only (Part 2), never utility scoring. |

---

## Already done (don't regress)

- **Decision reach** — `syncNavReachHorizon` + `navReachStepsTo`; no `*Dist`, no per-tick `{ stepsTo() }` objects.
- **One context** — flat `decisionContext`; no `blackboard` / `decisionSnapshot` pair.
- **Shared agent layer** — slot merge, scorer registry, band tables, `gameDecisionContext.js` entry.
- **Config owns slots, scoring, bands, sprint** — deleted species `*DecisionModel.js` trees; one `deriveSprintIntent.js`.
- **Shared autosim** — `createAgentAutosim(profileId)`; snake/flee/squid tick through `agentAutosim.js`.
- **Unified instance (runtime path)** — production uses `AgentInstance` + `createAgentSpecies`; combat uses profile traits not `instanceof`.

Ship log: [`fsm/history.md`](fsm/history.md) · [`history.md`](fsm/history.md) — archive only.

---

## Step 6 audit — 6.1–6.7 shipped

Production path: `setupSnakeGame` → scene spawners → `spawnAgentChain.js` → `spawnSpeciesBatch` → `createAgentSpecies` → `createAgentInstance` → `createAgentAutosim`.

| Sub-step | Shipped | Hygiene verdict |
|----------|---------|-----------------|
| **6.1 spawn** | `spawnGameAgentChain(profileId)`, sandbox `leaderIndex` | ✅ Unified spawn spec. Shims deleted; tests/scenes import `spawnAgentChain.js`. |
| **6.2 combat** | `agentCombatTraits.js`, profile `combat` blocks | ✅ Profile `gameplay.leader.maxSpeed` — no root compat aliases. |
| **6.3 relationships** | `agentRelationships.js`, profile `relationships` | ✅ Clean. Species matrix logic gone from runtime. |
| **6.4 species** | `createAgentSpecies.js`, `SNAKE_GAME_SPECIES` map | ✅ Factory wired in prod. ❌ **Orphans on disk** (zero importers): `SnakeInstance.js`, `FleeAgentInstance.js`, `species/snakeSpecies.js`, `species/fleeAgentSpecies.js` — delete when convenient. |
| **6.5 gameplay** | `applyAgentGameplay.js`, profile `gameplay.leader/body` | ✅ One canonical key per locomotion fact. |
| **6.6 runtime shims** | Deleted 9 shim files; tests/harness on canonical API | ✅ |
| **6.7 config dialect** | Removed compat machinery; profile-path reads only | ✅ Grep gates green; tests migrated to `agentProfiles.*` / `shared.*`. |

**Remaining disk orphans (not blocking flow):** `SnakeInstance.js`, `FleeAgentInstance.js`, `species/snakeSpecies.js`, `species/fleeAgentSpecies.js`.

---

## The plan (do in order)

### 1–5 — Decision engine ✅

Shipped. See history.

---

### 6 — Agent runtime consolidation

#### 6.1–6.5 ✅ (see audit above)

#### 6.7 — Config dialect pass ✅

Shipped: removed `LEGACY_*`, `publishConfigCompatAliases`, root `fleeAgent` merge, and duplicate locomotion keys from `Config/games/snake.js`. `applyAgentGameplay` reads `profile.gameplay.leader/body` only. Libraries and tests use `agentProfiles.*` / `shared.*`; `deriveThreatState` accepts both full config and `getThreatConfig()` flat shape.

**6.7 grep gates (green):**

```text
rg 'publishConfigCompatAliases|LEGACY_SHARED|LEGACY_SNAKE|config\.fleeAgent|fleeAgent:'
rg 'headMaxSpeed|brainMaxSpeed|segmentPropId' Libraries/Game/snake
rg 'applySnakeGameConfig\(\{ headMaxSpeed|applySnakeGameConfig\(\{ fleeAgent' tests/
```

<details>
<summary>6.6 + 6.7 shipped detail (archive)</summary>

#### 6.6 — Delete interim runtime layer ✅

Shipped: tests/harness migrated to `createAgentAutosim`, `createAgentInstance`, `spawnAgentChain.js`, `agentMetabolism.js`, `resolvePackSteeringOptions.js`. Deleted 9 shim files. Stripped `createAliveSnakeInstance`, `createFleeAgentInstance`, `createSnakeBrain` aliases.

**Deleted files:** `snakeAutosim.js`, `squid/squidAutosim.js`, `squid/squidMetabolism.js`, `squid/squidScale.js`, `squid/spawnSquidChain.js`, `fleeAgent/fleeMetabolism.js`, `fleeAgent/spawnFleeAgent.js`, `fleeAgent/resolveFleePackOptions.js`, `fleeAgent/eatFleeAgentFood.js`.

**Kept:** `agentAutosim.js`, `AgentInstance.js`, `spawnAgentChain.js`, scene spawners, flee presentation/intent adapters.

</details>

---

### Step 6 done when

- Adding agent #4 = `agentProfiles` block + scene spawn count — no new Instance/Autosim/Metabolism/Species files.
- 6.6 ✅ · 6.7 ✅ · grep gates green.
- Net negative LOC across step 6 (expect ~12–15 files deleted, ~0 new runtime files).
- **`fleeAgent/` and `squid/` folders** contain only scene spawners + flee presentation/intent (decision layer) — no runtime shims.

**Gate for flow locomotion:** Step 6 complete (6.6 + 6.7 ✅). Flow work may start.

---

## Future (after step 6)

### Flow locomotion

**Problem:** Flee still steers with cell-pick heuristics; crowds and smooth escape want local flow.

**Do:** Replace flee **steering** (not decision reach) with backward flow sampling at agent cell. Decision scoring **stays** on `navReachHorizon` — never per-agent flow windows on the utility hot path ([`objects.md`](objects.md), [`hygiene.md`](hygiene.md)).

**Done when:** flee escape/regroup uses flow downhill; reach for scoring unchanged.

---

## Optional (only if profiling says so)

- Reuse one `decisionContext` object per agent instance (mutate in place) instead of fresh object + spreads every tick.
- Nets-only pick — registry returns numbers; drop score-detail objects on hot path if scratch pool still smells.
- Drop `buildSnakeDecisionFrame` from public API; tests use full context build or stub `reachSteps` on a minimal bag.

---

## PR rules (every step)

- Net negative LOC unless you explain why in the PR.
- Snake **and** flee updated in the same PR when touching shared AI code.
- Tests migrate with the dialect — **no shims**, no "fix tests later."
- No new getters, resolvers, `Libraries/AI/decision/` package, or passthrough wrappers.
- No second distance dialect — ever.

---

## What not to repeat

| Don't | Do |
|-------|-----|
| Species `deriveFooSprintIntent` + adapter callback + spec hook | One derive; config rules; latch calls same function |
| New agent = 7 files + 10 touch points | Config block + spawn entry on shared chain stack |
| `instanceof SquidInstance` combat trees | Profile `combat` traits; one dispatcher |
| Per-species relationship matrix edits | Profile `relationships` + one resolver |
| Test-only factory aliases in prod | Tests import the same public API as runtime |
| Wrap a range check in objects | Scalar + band table |
| `profile.headMaxSpeed ?? gameplay.maxSpeed` forever | One canonical key; migrate tests; delete fallback |

---

## Current files (ground truth)

| Role | File |
|------|------|
| Engine entry | `Libraries/AI/agents/buildAgentDecisionContext.js` |
| Game glue | `Libraries/AI/agents/gameDecisionContext.js` |
| Scoring | `Libraries/AI/agents/scoreDecisionModes.js` |
| Slots | `Libraries/AI/agents/mergeSlotsFromSchema.js` |
| Bands | `Libraries/AI/agents/bandFromThresholds.js` |
| Sprint | `Libraries/AI/agents/deriveSprintIntent.js` |
| Autosim | `Libraries/Game/snake/agentAutosim.js` |
| Instance | `Libraries/Game/snake/AgentInstance.js` |
| Spawn | `Libraries/Game/snake/spawnAgentChain.js` · `Libraries/Sandbox/spawnAgentChain.js` |
| Combat traits | `Libraries/Game/snake/agentCombatTraits.js` |
| Relationships | `Libraries/Game/snake/agentRelationships.js` |
| Species factory | `Libraries/Game/snake/species/createAgentSpecies.js` · `species/index.js` |
| Gameplay apply | `Libraries/Game/snake/applyAgentGameplay.js` |
| Config | `Config/games/snake.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |

| Config loader | `Libraries/Game/snake/snakeGameConfig.js` |
| Threat derive | `Libraries/AI/agents/deriveThreatState.js` |

**Deleted in 6.6:** `snakeAutosim.js`, `squid/squidAutosim.js`, `squid/squidMetabolism.js`, `squid/squidScale.js`, `squid/spawnSquidChain.js`, `fleeAgent/fleeMetabolism.js`, `fleeAgent/spawnFleeAgent.js`, `fleeAgent/resolveFleePackOptions.js`, `fleeAgent/eatFleeAgentFood.js`.

**Shipped in 6.7:** compat layer removed from `snakeGameConfig.js`; duplicate locomotion keys removed; readers use `agentProfiles.*` / `shared.*` only.
