# Snake / flee / squid AI — what's next

One page. Goal: **one decision engine, one agent runtime, config-only new agents** — with a decision tick that matches the rest of the engine's hygiene.

Binding: [`hygiene.md`](hygiene.md) · [`objects.md`](objects.md) · [`frame.md`](frame.md) · [`passthrough.md`](passthrough.md)

Ship log (archive): [`fsm/history.md`](fsm/history.md)

---

## Shipped (don't regress)

**Decision (steps 1–5):** One flat `decisionContext` per tick — merged targets, `reachSteps`, threat/hunger facts, scored modes, chosen intent, sprint. Species differ only in `Config/games/snake.js` (`agentProfiles.*` blocks). No `blackboard` / `decisionSnapshot` pair. No species `*DecisionModel.js` trees. Reach for scoring: `syncNavReachHorizon` + `navReachStepsTo` (generation-stamp BFS) — never `{ stepsTo() }`, never flow windows on the utility path.

**Runtime (step 6):** One chain stack for all species.

```text
setupSnakeGame → scene spawners → spawnAgentChain.js → createAgentSpecies
  → createAgentInstance → createAgentAutosim(profileId)
```

- Spawn, combat traits, relationships, gameplay apply — all profile-driven.
- Nine runtime shims deleted; tests/harness on canonical API.
- Config dialect unified: `agentProfiles.*` / `shared.*` only — no root compat aliases, no duplicate locomotion keys.

**Adding agent #4 today:** `agentProfiles` block + spawn count. No new Instance / Autosim / Metabolism / Species files.

**Disk orphans (delete when convenient, zero importers):** `SnakeInstance.js`, `FleeAgentInstance.js`, `species/snakeSpecies.js`, `species/fleeAgentSpecies.js`, orphan `fleeDecisionModel.js` / `createFleeExploreIntent.js` if unwired.

---

## Ground truth (production path)

| Role | File |
|------|------|
| Decision build | `Libraries/AI/agents/buildAgentDecisionContext.js` |
| Game glue | `Libraries/AI/agents/gameDecisionContext.js` |
| Intent adapter | `Libraries/Game/snake/createGroundNavIntentAdapter.js` |
| Autosim | `Libraries/Game/snake/agentAutosim.js` |
| Instance | `Libraries/Game/snake/AgentInstance.js` |
| Spawn | `Libraries/Game/snake/spawnAgentChain.js` |
| Reach (frozen) | `Libraries/Navigation/navReachHorizon.js` |
| Config | `Config/games/snake.js` · `Libraries/Game/snake/snakeGameConfig.js` |

---

## The plan (do in order)

### 7 — Decision tick objects pass ← **NEXT**

**Problem:** Step 6 unified *structure* (one engine, one config shape). The decision tick still *allocates* like Game Maker: fresh bags every agent every frame — `visible` → spread `memoryWorld` → `{ visible, remembered, known }` → full `decisionContext` → FSM world spread for flee. Reach is slab-grade; everything around it is `{}` and spreads.

This is not "add scratch objects everywhere." Wrong fix. Right fix matches [`frame.md`](frame.md) and [`objects.md`](objects.md):

| Do | Don't |
|----|-------|
| **Delete** intermediate bags | Pool/recycle the same bag chain |
| **One instance-owned frame** per intent/autosim — mutate fields in place | Module-global scratch for per-agent state |
| **Module scratch only** for shared tick work (reach BFS — already done) | TypedArray columns for heterogeneous decision facts |
| **Scalars / fixed keys** for reach steps and mode scores on the reused frame | Fresh `{}` maps from builders every tick |
| **One world shape** for snake and flee | `{ ...memoryWorld, decisionContext }` flee dialect |

**Per-tick smell today (one agent):**

```text
perceiveAgentWorld        → new visible bag
enrichWorld               → spread + memorySource bag
readAgentRouteStatus      → new 8-field object
buildAgentReachSteps      → new {} map
buildAgentDecisionContext → spread input, mergeSlots → 3 new slot bags,
                            routeEvents [], score maps, full ctx
createAgentIntent         → makeContext ×2, policy spread, effects closures
flee formatPerceiveWorld  → { ...memoryWorld, decisionContext }
```

**A. Collapse the bag chain (perceive → decide)**

| File | Change |
|------|--------|
| `createGroundNavIntentAdapter.js` | Intent instance owns reused `visible`, `memoryWorld`, `routeStatus`, `reachSteps`, `decisionContext`. `perceiveWithMemory` mutates; no flee world spread. |
| `createAgentIntentMemory.js` | Stop spread-enrich; update fields on stable `memoryWorld`. Reuse `memorySource`. |
| `targetMemory.js` | Update records in place when target still visible; no `makeRecord` every tick. |
| `agentWorldPerception.js` | Write into intent-owned visible frame (or accept out-buffer from adapter). |
| `groundNavIntentProfiles.js` | Drop `perceiveSource: "memory"` / `attachDecisionToPerceiveWorld` split — one shape. |

**B. Decision build — mutate, don't mint**

| File | Change |
|------|--------|
| `buildAgentDecisionContext.js` | Build into instance frame; no `{ ...input }`; reuse `events` buffer. |
| `mergeSlotsFromSchema.js` | Write into frame-owned `known` (and only what's still needed of visible/remembered); stop fresh `{}` each tick. |
| `buildAgentEventTargets.js` / `targetEvents.js` | Reused events list or inline without `[]` + push literals. |
| `gameDecisionContext.js` | Cache `scoringEnv` on spec at init; stop `buildScoringEnv()` per tick. |
| `deriveThreatState.js` | Read `getSharedConfig()` at use site; delete `config.shared ?? config`. |
| `snakeGameConfig.js` | Delete or narrow `getThreatConfig()` spread if nothing needs flat shape. |
| `utilityScoring.js` / `scoreDecisionModes.js` | Hot path: nets-only pick; score details on cold/debug path only. |

**C. FSM tail**

| File | Change |
|------|--------|
| `createAgentIntent.js` | One `makeContext` per tick; reuse effects where possible. |
| `agentAutosim.js` | Ensure `groundNav` exists at spawn — no lazy `??=` on sprint path. |
| `resolvePackSteeringOptions.js` | Reuse anchor scratch or read scalars off `known`. |

**D. Cleanup (same PR)**

- Delete disk orphans listed above if grep confirms zero importers.
- Snake **and** flee tests updated in same PR — no shims, no `{ stepsTo: () => N }` mocks.

**7 done when:**

- Per agent per decision tick: **zero** fresh `{ visible, remembered, known }`, **zero** spread world bags, **zero** `getThreatConfig()` allocation.
- FSM reads `decisionContext` by reference — not embedded in a copied world.
- Mode pick runs on reused score slots or scalar nets; details only when debug/HUD asks.
- Net negative LOC across the pass.

**7 grep gates (`Libraries/` + `tests/`):**

```text
rg 'formatPerceiveWorld.*\.\.\.|attachDecisionToPerceiveWorld|perceiveSource.*memory'
rg 'getThreatConfig\(\)' Libraries/AI
rg 'config\.shared \?\? config'
rg 'buildAgentReachSteps\('          # should be Into or inline on frame, not fresh {}
rg 'mergeSlotsFromSchema'            # zero hits returning fresh {} — or only cold/test path
```

Manual: run snake + flee decision/FSM suites; no behavior change, allocation shape only.

---

### 8 — Flow locomotion

**Gate:** Step 7 merged. Do not add flow steering on top of the current per-tick bag chain.

**Problem:** Flee escape/regroup uses cell-pick heuristics; crowds want smooth local flow.

**Do:** Replace flee **steering only** (not decision reach) with backward flow sampling at agent cell. Decision scoring stays on `navReachHorizon`.

**Rules:**

- Flow windows are locomotion-only — never on utility scoring hot path.
- Flow reads/writes follow step 7 frame pattern — no new per-tick opts bags.
- Snake + flee in same PR when touching shared adapter code.

**8 done when:** Flee escape/regroup uses flow downhill; reach for scoring unchanged; step 7 gates still green.

---

## PR rules (every step)

- Net negative LOC unless you explain why.
- Tests migrate with the dialect — same PR, no shims.
- No new getters, resolvers, `Libraries/AI/decision/` package, or passthrough wrappers.
- No second distance dialect — ever.
- Read [`hygiene.md`](hygiene.md) before opening the PR.

---

## Later (not gated on 7/8)

- Strategy / game theory / GOAP — see [`AI.md`](../../AI.md) tier 8 (not started).
- Generic perception→memory→slot pipeline — deferred; step 7 collapses bags without building a framework.
- Decision context pooling across agents — not the model; one frame **per instance**, not module scratch.
