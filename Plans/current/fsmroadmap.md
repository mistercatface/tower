# Snake / flee / squid AI — what's left

One page. No pass names. Goal: **one decision engine, one agent runtime, config-only new agents — zero duplicate species JS.**

Hygiene when touching this: [`hygiene.md`](hygiene.md) · [`stupid.md`](stupid.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md)

---

## Goal

**Decision layer (done):** Every tick an agent gets **one `decisionContext`**: merged targets, path-step reach, threat/hunger facts, scored modes, chosen intent, sprint intent. Snake, flee, and squid differ only in **`Config/games/snake.js`** intent/decision blocks — not parallel derive functions or adapter callbacks.

**Runtime layer (in progress):** Every agent is **one chain** (`AgentInstance` + `createAgentAutosim`) spawned via shared infrastructure. Profile config drives segment topology, metabolism, combat, relationships, and presentation. Adding agent #4 is a **`agentProfiles` block + spawn count** — not new Instance/Autosim/Metabolism/Species files and not N×N edits across combat and relationship matrices.

**Tests:** Migrate with the dialect in the same PR. No production aliases kept alive because tests still import `createFleeAgentInstance`, `SnakeInstance`, or harness-only factories.

---

## Already done (don't regress)

- **Decision reach** — `syncNavReachHorizon` + `navReachStepsTo`; no `*Dist`, no per-tick `{ stepsTo() }` objects.
- **One context** — flat `decisionContext`; no `blackboard` / `decisionSnapshot` pair.
- **Shared agent layer** — slot merge, scorer registry, band tables, `gameDecisionContext.js` entry.
- **Config owns slots, scoring, bands, sprint** — deleted `*DecisionModel.js`; one `deriveSprintIntent.js`.
- **Shared autosim** — `createAgentAutosim(profileId)`; snake/flee/squid tick through one module.
- **Unified instance** — `AgentInstance.js` replaces `SnakeInstance`, `SquidInstance`, `FleeAgentInstance`; combat uses profile helpers not `instanceof`.

Ship log: [`fsm/history.md`](fsm/history.md) · [`history.md`](fsm/history.md) — archive only.

---

## The plan (do in order)

### 1–5 — Decision engine ✅

Shipped: config slot merge, engine scoring, hunger bands, deleted species decision models, one sprint path. See history.

---

### 6 — Agent runtime consolidation ← **NEXT**

**Problem:** Squid proved the gap — copy-pasted file trees and ~10 touch points per new agent. Interim wrappers (`snakeAutosim`, `squidAutosim`, `fleeMetabolism`, `squidMetabolism`, `squidScale`) still exist.

**Do (in order within this step):**

1. **`spawnAgentChain`** ✅ — `spawnGameAgentChain(profileId)` + sandbox `leaderIndex`; flee = 1 seg / leader 0, snake = leader 0, squid = leader 1. `spawnFleeAgent.js` / `spawnSquidChain.js` are re-export shims (delete when tests import game module directly).
2. **Profile-driven combat** ✅ — `agentProfiles.*.combat` traits + `agentCombatTraits.js`; `snakeCombat.js` dispatches from config, not profile `instanceof`.
3. **Profile-driven relationships** — `agentProfiles.*.relationships` table + one `resolveRelationshipFromProfile(...)`; stop editing snake/flee/squid species files for agent #4.
4. **`createAgentSpecies(profileId)`** — dedupe `species/*.js` register/start/stop/validate/tick boilerplate.
5. **`applyAgentGameplay(profileId, role)`** — replace `applySnakeHeadGameplay` / `applySquidBrainGameplay` / segment clones in `snakeGameConfig.js`.
6. **Delete interim layer** — remove autosim/metabolism/scale wrappers; tests call `createAgentInstance({ profileId })` and `spawnAgentChain(...)` directly.

**Done when:** Adding a chain agent requires only config + spawn list entry; grep clean for `@deprecated`, species-specific metabolism shims, and test-only factory aliases; net negative LOC.

**Gate:** Steps 1–5 (decision) merged ✅ · `AgentInstance` merged ✅.

---

## Future (after step 6)

### Flow locomotion

**Problem:** Flee still steers with cell-pick heuristics; crowds and smooth escape want local flow.

**Do:** Replace flee **steering** (not decision reach) with backward flow sampling at agent cell. Decision scoring **stays** on `navReachHorizon` — never per-agent flow windows on the utility hot path.

**Done when:** flee escape/regroup uses flow downhill; reach for scoring unchanged.

**Gate:** Step 6 (agent runtime) merged — flow is not blocked by duplicate spawn/combat/species forks.

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
| Config | `Config/games/snake.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |

**Delete when step 6 finishes:** `snakeAutosim.js`, `squid/squidAutosim.js`, `fleeAgent/fleeMetabolism.js`, `squid/squidMetabolism.js`, `squid/squidScale.js`, redundant spawn wrappers.
