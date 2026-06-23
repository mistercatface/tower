# Snake / flee / squid AI — what's left

One page for status. Goal: **one decision engine, one agent runtime, config-only new agents — zero duplicate species JS.**

Hygiene when touching this: [`hygiene.md`](hygiene.md) · [`stupid.md`](stupid.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md)

---

## Goal

**Decision layer (done):** Every tick an agent gets **one `decisionContext`**: merged targets, path-step reach, threat/hunger facts, scored modes, chosen intent, sprint intent. Snake, flee, and squid differ only in **`Config/games/snake.js`** intent/decision blocks — not parallel derive functions or adapter callbacks.

**Runtime layer (in progress):** Every agent is **one chain** (`AgentInstance` + `createAgentAutosim`) spawned via shared infrastructure. Profile config drives segment topology, metabolism, combat, relationships, and presentation. Adding agent #4 is a **`agentProfiles` block + spawn count** — not new Instance/Autosim/Metabolism/Species files and not N×N edits across combat and relationship matrices.

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

## Step 6 audit — 6.1–6.5 shipped, debt left behind

Production path is correct: `setupSnakeGame` → scene spawners → `spawnAgentChain.js` → `spawnSpeciesBatch` → `createAgentSpecies` → `createAgentInstance` → `createAgentAutosim`.

| Sub-step | Shipped | Hygiene verdict |
|----------|---------|-----------------|
| **6.1 spawn** | `spawnGameAgentChain(profileId)`, sandbox `leaderIndex` | ✅ Unified spawn spec. ❌ **Shims remain:** `fleeAgent/spawnFleeAgent.js`, `squid/spawnSquidChain.js` — 9 test files + 2 scene files still import shims. |
| **6.2 combat** | `agentCombatTraits.js`, profile `combat` blocks | ✅ No `instanceof` trees. ❌ `snakeCombat.js` still reads root `getSnakeGameConfig().headMaxSpeed` (compat alias) — fix in 6.7. |
| **6.3 relationships** | `agentRelationships.js`, profile `relationships` | ✅ Clean. Species matrix logic gone from runtime. |
| **6.4 species** | `createAgentSpecies.js`, `SNAKE_GAME_SPECIES` map | ✅ Factory wired in prod. ❌ **Orphans on disk** (zero importers via `species/index.js`): `SnakeInstance.js`, `FleeAgentInstance.js`, `species/snakeSpecies.js`, `species/fleeAgentSpecies.js`. Roadmap said deleted — not true yet. |
| **6.5 gameplay** | `applyAgentGameplay.js`, profile `gameplay.leader/body` | ✅ Five per-species apply helpers deleted. ❌ **Dual dialect introduced:** resolver uses `profile.headMaxSpeed ?? gameplay.maxSpeed` (and flee/squid equivalents). Config duplicates keys (`maxSpeed` + `gameplay.leader.maxSpeed` on flee). Legacy fallbacks exist **for test compat** — must die in 6.7, not become permanent. |

**Test divergence (must fix in 6.6):** ~15 test/harness files still on `createSnakeAutosim`, `createSnakeBrain`, `createFleeAgentInstance`, `createAliveSnakeInstance`, `fleeAgent/spawnFleeAgent.js`, `fleeAgent/fleeMetabolism.js`. Harness `createWiredSnakeAutosim` bypasses production species path.

---

## The plan (do in order)

### 1–5 — Decision engine ✅

Shipped. See history.

---

### 6 — Agent runtime consolidation

#### 6.1–6.5 ✅ (see audit above)

#### 6.6 — Delete interim runtime layer ← **NEXT**

**One PR. Migrate tests first, then delete. No "Libraries clean, tests later."**

**A. Migrate imports (tests + harness + scene spawners)**

| Old import | New import |
|------------|------------|
| `snakeAutosim.js` → `createSnakeAutosim`, `createSnakeBrain`, `runSnakeFsmTick` | `agentAutosim.js` → `createAgentAutosim`, `runAgentFsmTick`; `agentBrain.js` → `createAgentBrain` |
| `AgentInstance.js` → `createAliveSnakeInstance`, `createFleeAgentInstance` | `createAgentInstance(state, { profileId, headId, spawnGroupId, … })` |
| `fleeAgent/spawnFleeAgent.js` → `spawnFleeAgent`, `resolveFleeAgentForwardDir` | `spawnAgentChain.js` (exports already live there) |
| `squid/spawnSquidChain.js` → `spawnSquidChain` | `spawnAgentChain.js` |
| `fleeAgent/fleeMetabolism.js` → `createFleeMetabolism`, `getFleeHunger`, … | `agentMetabolism.js` → `createSimpleAgentMetabolism`, `getSimpleAgentHunger`, … |
| `fleeAgent/resolveFleePackOptions.js` | `resolvePackSteeringOptions.js` |
| `tests/harness/snakeGameHarness.js` → `createWiredSnakeAutosim` | `createAgentAutosim(state, { profileId: AGENT_PROFILE.snake, leaderId, … })` |

**Test files to touch:** `snakeAutosim.test.js`, `snakeFsmTransitions.test.js`, `snakeMinLengthDeath.test.js`, `snakeInstance.test.js`, `fleeAgentSpawn.test.js`, `fleeAgentCombat.test.js`, `fleeAgentDecision.test.js`, `fleeAgentMetabolism.test.js`, `fleePackBlend.test.js`, `focusedAgentDebugOverlays.test.js`, `snakeTeamRelationship.test.js`, `agentAllyMemory.test.js`, `harness/snakeGameHarness.js`.

**Scene files:** `fleeAgent/spawnFleeAgentsInScene.js`, `squid/spawnSquidsInScene.js` — retarget imports only; keep batch logic.

**B. Delete files (after zero importers)**

| File | Why |
|------|-----|
| `Libraries/Game/snake/snakeAutosim.js` | Passthrough to `createAgentAutosim` |
| `Libraries/Game/snake/squid/squidAutosim.js` | Dead passthrough (zero importers) |
| `Libraries/Game/snake/fleeAgent/fleeMetabolism.js` | Species metabolism shim |
| `Libraries/Game/snake/squid/squidMetabolism.js` | Dead shim |
| `Libraries/Game/snake/squid/squidScale.js` | `@deprecated` alias |
| `Libraries/Game/snake/fleeAgent/spawnFleeAgent.js` | 1-line re-export |
| `Libraries/Game/snake/squid/spawnSquidChain.js` | 1-line re-export |
| `Libraries/Game/snake/fleeAgent/resolveFleePackOptions.js` | Re-export shim |
| `Libraries/Game/snake/SnakeInstance.js` | Superseded by `AgentInstance` |
| `Libraries/Game/snake/fleeAgent/FleeAgentInstance.js` | Parallel flee runtime (own tick loop) |
| `Libraries/Game/snake/fleeAgent/eatFleeAgentFood.js` | Only used by deleted `FleeAgentInstance`; unified eat in `agentAutosim` |
| `Libraries/Game/snake/species/snakeSpecies.js` | Orphan — factory replaced it |
| `Libraries/Game/snake/species/fleeAgentSpecies.js` | Orphan — factory replaced it |

**C. Strip aliases from kept files**

| File | Remove |
|------|--------|
| `AgentInstance.js` | `createAliveSnakeInstance`, `createFleeAgentInstance` |
| `agentBrain.js` | `createSnakeBrain` (`@deprecated`) |

**D. Keep (not shims — real logic or decision layer)**

| File | Role |
|------|------|
| `agentAutosim.js`, `AgentInstance.js`, `agentMetabolism.js`, `agentBrain.js` | Canonical runtime |
| `spawnAgentChain.js` | Canonical spawn (`spawnFleeAgent` / `spawnSquidChain` **belong here**, not in subfolders) |
| `fleeAgent/spawnFleeAgentsInScene.js`, `squid/spawnSquidsInScene.js` | Scene batch placement |
| `fleeAgent/syncFleeAgentPresentation.js` | Flee tint (called from `AgentInstance`) |
| `fleeAgent/createFleeExploreIntent.js`, `fleeAgent/fleeDecisionModel.js` | Decision adapter — out of 6.6 delete list; config reads fixed in 6.7 |
| `snakeStarvation.js` | Snake growth metabolism — intentionally snake-specific, wired via `agentAutosim` |

**6.6 grep gates (must be zero in `Libraries/` + `tests/`):**

```text
rg 'createSnakeAutosim|createSnakeBrain|runSnakeFsmTick|createAliveSnakeInstance|createFleeAgentInstance'
rg 'SnakeInstance|FleeAgentInstance|SquidInstance'
rg 'fleeAgent/spawnFleeAgent|squid/spawnSquidChain|fleeMetabolism|squidMetabolism|squidScale'
rg '@deprecated' Libraries/Game/snake
rg 'snakeAutosim\.js|squidAutosim\.js'
```

---

#### 6.7 — Config dialect pass (required before flow locomotion)

**Problem:** 6.5 left **two config dialects** alive — the exact pattern `stupid.md` forbids (`headMaxSpeed` vs `gameplay.leader.maxSpeed`, top-level `fleeAgent` merge, root compat aliases). Future AI will read whichever grep hits first and fork again.

**One PR after 6.6. Same test-migrate rule.**

**A. Delete compat machinery in `snakeGameConfig.js`**

- Remove `LEGACY_SHARED_KEYS`, `LEGACY_SNAKE_PROFILE_KEYS`, `publishConfigCompatAliases`, top-level `config.fleeAgent` → merge.
- `applySnakeGameConfig(overrides)` merges only onto `SNAKE_GAME_DEFAULTS` shape — no republishing `headMaxSpeed`, `segmentPropId`, etc. to config root.

**B. One write site per fact in `Config/games/snake.js`**

| Delete duplicate | Canonical location |
|------------------|-------------------|
| snake `headMaxSpeed`, `headAccel`, `headFriction`, `segmentFriction`, `segmentDensity` | `agentProfiles.snake.gameplay.leader` / `.body` |
| flee `maxSpeed`, `accel`, `friction` (lines 183–185) | `agentProfiles.flee_agent.gameplay.leader` |
| squid `brainMaxSpeed`, `brainAccel`, `brainFriction`, `segmentFriction`, `segmentDensity` | `agentProfiles.squid.gameplay.leader` / `.body` |

**C. Readers — profile path only**

| File | Change |
|------|--------|
| `applyAgentGameplay.js` | Read `profile.gameplay[role]` only — delete legacy `headMaxSpeed` / `brainMaxSpeed` / `maxSpeed` fallbacks |
| `snakeCombat.js` | `getAgentProfile(AGENT_PROFILE.snake).gameplay.leader.maxSpeed` — not root `headMaxSpeed` |
| `fleeDecisionModel.js` | `getAgentProfile(AGENT_PROFILE.flee)` — not `config.fleeAgent.*` |
| Tests | `{ headMaxSpeed: 95 }` → `{ agentProfiles: { snake: { gameplay: { leader: { maxSpeed: 95 } } } } }`; `{ fleeAgent: … }` → `{ agentProfiles: { flee_agent: … } }`; `config.segmentPropId` → `config.agentProfiles.snake.bodyPropId` |

**D. Docs**

- Update `Plans/AI.md` / `Plans/games/snake.md` — remove references to deleted instance/spawn/metabolism files; point at ground-truth table below.

**6.7 grep gates:**

```text
rg 'publishConfigCompatAliases|LEGACY_SHARED|LEGACY_SNAKE|config\.fleeAgent|fleeAgent:'
rg 'headMaxSpeed|brainMaxSpeed|segmentPropId' Libraries/Game/snake   # except Config/games/snake.js canonical blocks if any alias remains for docs only — prefer zero
rg 'applySnakeGameConfig\(\{ headMaxSpeed|applySnakeGameConfig\(\{ fleeAgent' tests/
```

---

### Step 6 done when

- Adding agent #4 = `agentProfiles` block + scene spawn count — no new Instance/Autosim/Metabolism/Species files.
- 6.6 + 6.7 grep gates green.
- Net negative LOC across step 6 (expect ~12–15 files deleted, ~0 new runtime files).
- **`fleeAgent/` and `squid/` folders** contain only scene spawners + flee presentation/intent (decision layer) — no runtime shims.

**Gate for flow locomotion:** Step 6.6 **and** 6.7 merged. Do not start flow while compat aliases or passthrough autosim paths exist — next agent will wire flow into the wrong fork.

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

**Delete in 6.6:** see table above (12 files + 2 species orphans).

**Fix in 6.7:** `snakeGameConfig.js` compat layer · duplicate config keys · `applyAgentGameplay` fallbacks · stale plan docs.
