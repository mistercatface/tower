# Stupid tests audit

**Situation:** 126 test files · ~710 `it()` blocks · `npm test` runs 25 files (one missing) · `npm run test:all` runs everything with 5s/test timeout.

**Rule of thumb (same as [`stupid.md`](stupid.md)):** tests use the **production dialect** or get updated in the same PR. Never keep prod shims so tests can lag. Never add tests that only assert registry/getter/harness wiring. Browser game — refresh is migration; tests should not encode in-session upgrade theater.

**Related:** [`stupid.md`](stupid.md) · [`library_defaults.md`](library_defaults.md) · `.cursor/rules/test-runs-targeted.mdc`

---

## What’s broken today

| Issue | Detail | Fix |
|-------|--------|-----|
| **Missing file in `npm test`** | `tests/vectorProp.test.js` listed in `package.json` but **does not exist** — `npm test` fails on that entry | Remove from script **or** restore a real vector/cache-key test (see `Plans/rendering.md`; `propScale.test.js` may cover enough) |
| **Stale deprecated script** | `test:deprecated:losShadow` → `Libraries/Deprecated/LosShadow/tests/losShadow.test.js` — **path gone** | Point at `tests/losShadow.test.js` or delete script |
| **Stale plan refs** | `Plans/procedural.md` cites `cavernFloorCells.test.js` — **file never existed** | Fix plan doc when touching procedural plans |
| **Windows glob noise** | Same files appear twice in some tools (`tests/foo` vs `tests\foo`) | Cosmetic; runner is fine |

---

## Target organization (stop token leeching)

### Three tiers — one runner, explicit scripts

```text
Tier 1 — smoke     npm test          ~40 files · <90s total · every agent/CI touch
Tier 2 — full      npm run test:all  everything not in tier 1
Tier 3 — slow      npm run test:slow manual / nightly only · hang-prone · perf budgets
```

**Tier 1 criteria (all must pass):**

- Catches regressions in **prod paths** (not harness wiring, not getter shape)
- Finishes reliably under 5s/test timeout
- No full map-gen + worker bake unless the feature *is* map-gen (corridor/locked-room exceptions stay tier 1 — high value)

**Tier 3 candidates today:** `snakeSplitLayout`, `railMazeCorridorBelts`, `snakePerfBudget`, `snakeMapGen`, `snakeFsmTransitions` (full harness FSM), `corridorMultiLane` (seed loops), `tileBake*`, `surfaceTextureComposer` (call-count profiling)

**Agent rule (already in `.cursor/rules`):** do not run `npm test` or `test:all` as default wrap-up; run **one file** when the change touches that domain.

### Add-test gate (paste into PR self-check)

Before adding a test file or `it()` block:

1. Does an existing file already cover this behavior? → extend it, don’t fork.
2. Is it asserting **shape** (catalog fields, getter return, dual `blackboard`/`decisionSnapshot`)? → delete idea; fix prod dialect instead.
3. Does it need worker + 256×256 bake? → tier 3, not tier 1.
4. Would deleting the test leave zero coverage of a user-visible bug class? If no → don’t add.

### Dialect grep gates (same PR as prod migration)

When H2 / P4 passes land, **zero hits** in `tests/`:

```text
rg createSnakeDecisionBlackboard
rg 'decisionSnapshot|blackboard\.facts'
rg getGameLauncher
```

Currently failing files: `snakeDecisionModel`, `snakeIntent`, `snakeForageIntent`, `snakeEngagement`, `agentAllyMemory`, `fleeAgentDecision`, `fleePackBlend`, `gameLaunch`.

---

## Delete outright (~8 files · ~15 tests)

These leech tokens and teach nothing that isn’t already caught elsewhere.

| File | Tests | Why it’s stupid | Action |
|------|-------|-----------------|--------|
| `tests/fleeBallAsset.test.js` | 1 | Static `propCatalog["flee_ball"]` field assertions — `drawShapeParity.test.js` already covers flee_ball attachments/footprint | **Delete file** |
| `tests/snakeGameHarness.test.js` | 1 | Tests harness `buildSnakeGameSession` wiring; if harness breaks, every snake integration test fails anyway | **Delete file** |
| `tests/utilityScoring.test.js` | 3 | Pure arithmetic on `netScoreDetail` / tie-break — duplicated by `snakeDecisionModel.test.js` scoring cases | **Delete file** |
| `tests/resolveGroundNavPathOverlayBehavior.test.js` | 2 | Two-line Map lookup resolver; no topology, no overlay draw | **Delete file** (or one case in sandbox editor if overlay wiring ever regresses) |
| `tests/gameLaunch.test.js` (partial) | 3 of 7 | `getGameLauncher` + duplicate `GAME_LAUNCHERS.puzzle/snake` map checks — P4-1 getter theater | **Delete** getter/map tests; **keep** `parseGameLaunchQuery` tests; assert via `GAME_LAUNCHERS[id]` directly |
| `tests/hpaRegionGraph.test.js` (partial) | 1 of 3 | “wrapper and legacy state” pack parity — keeps dead dual pack path alive | **Delete** that `it()` when legacy path removed from prod |
| `tests/proceduralFields.test.js` (partial) | 1 of 9 | Inline `legacyHashCell` / `legacyVoronoiEdgeMetric` duplicated in test — migration parity theater | **Delete** legacy parity case after prod hash confirmed |
| `tests/agentAllyMemory.test.js` (partial) | 1 of 3 | Asserts `blackboard.facts` **and** `decisionSnapshot.allyState` same reference — dual-dialect theater per stupid.md | **Delete** on H2 migration |

---

## Merge / consolidate (~20 files → ~10)

Stop paying duplicate harness setup (worker nav + `createTestState` copied in 6+ snake intent files).

### Snake AI / intent cluster

| Files | Overlap | Plan |
|-------|---------|------|
| `snakeDecisionModel.test.js` (43) | Canonical unit tests for hunger, scoring, policy, sprint, ally rules | **KEEP** as single unit source; migrate off `createSnakeDecisionBlackboard` / `decisionSnapshot` → `decisionContext` |
| `snakeIntent.test.js` (9) | Re-runs policy + explore steering + autosim mode with full worker harness | **Merge** explore-steering describes into one file; **drop** policy cases covered by decision model |
| `snakeForageIntent.test.js` (7) | Near-copy of `snakeIntent` setup (`createTestState`, `pickPolicyFromVisibleWorld`, flee autosim) | **Delete file** after moving any unique case to `snakeIntent` or decision model |
| `snakeEngagement.test.js` (4) | `publishAgentEngagement` + derive via old blackboard | **Merge** into `agentAllyMemory` or decision model; delete standalone |
| `agentAllyPerception.test.js` (6) | Full harness autosim `seek_ally` — integration duplicate of memory + decision | **Keep 1** integration case; rest covered by unit tests → tier 2 |
| `fleeAgentDecision.test.js` (10) | Parallel flee species copy of snake scoring | **Keep** if flee stays separate; shared scoring tables → decision model only |
| `policyHysteresis.test.js` (2) | Tiny; used by decision path | **Inline** into `snakeDecisionModel.test.js` or keep (cheap) |
| `targetMemory.test.js` (5) | Lower-level memory module | **KEEP** (distinct from ally memory) |
| `brain.test.js` (6) | Spatial memory + nav penalty | **KEEP**; verify no duplicate of `navStepPenalty` |

### Snake autosim / FSM / metabolism

| Files | Overlap | Plan |
|-------|---------|------|
| `snakeAutosim.test.js` (4) | Eat/growth focused | **KEEP** tier 1 |
| `snakeStarvation.test.js` (9) | Repeats eat/refill from autosim + metabolism ticks | **Trim** duplicate eat tests; keep metabolism-only |
| `snakeFsmTransitions.test.js` (16) | ~594 lines; full harness every mode transition | **Tier 3**; trim cases already in autosim/intent/decision model |
| `goalSeekAutosim.test.js` (1) | Isolated autosim contract with mocks | **KEEP** (small, different module) |
| `snakePerfBudget.test.js` (1) | 120-tick wall-clock ceiling | **Tier 3 only** |

### Nav / arrival overlap

| Files | Plan |
|-------|------|
| `groundNavArrival.test.js` (2) + `snakeNavArrival.test.js` (4) | **Merge** → one `groundNavArrival.test.js` (belt + world point cases) |
| `hpaBeltNav.test.js` (1) | Misnamed — only `isEntityOnFloorBelt` cell check, not HPA | **Rename** → `floorBeltCell.test.js` or merge into `navTopologyParity` |
| `gridNavContext.test.js` (1) | Worker sync on `commitEdit` | **Merge** into `nodeWorkerShim.test.js` |

### Config / gameplay passthrough

| Files | Plan |
|-------|------|
| `snakeHeadGameplay.test.js` (1) | Config → `headMaxSpeed` on strategy | **Merge** into `snakeGameConfig.test.js` |
| `snakeWalkableCells.test.js` (4) | Wrapper around generic walkable + map gen | **Keep 1** integration in `snakeMapGen`; delete rest |
| `collisionDefaults.test.js` (1) | Mostly exercises `withCollisionSettings` harness | **KEEP** only if LD-* defaults regression matters; else delete |

### Flee agent sprawl

| Files | Notes |
|-------|-------|
| `fleeAgentSpawn.test.js` (10) | Spawn wiring |
| `fleeAgentMetabolism.test.js` (9) | Metabolism |
| `fleeAgentCombat.test.js` (6) | Combat |
| `fleePackBlend.test.js` (4) | Pack steering |

**Plan:** keep species files but **dedupe scoring** with snake decision model; flee-specific spawn/combat stay. Review whether metabolism duplicates `snakeStarvation` patterns.

---

## Kinetic test sprawl (20 files · ~120 tests)

Most kinetic tests are **legitimate** — contact solver regressions are expensive to rediscover. The stupid part is **micro-files with 1–2 tests** that duplicate setup.

| File | Tests | Verdict |
|------|-------|---------|
| `kineticContactSolver.test.js` | 12 | **KEEP** tier 1 |
| `kineticSleepProps.test.js` | 7 | **KEEP** tier 1 |
| `activeKineticBodies.test.js` | 9 | **KEEP** tier 1 |
| `kineticContactPipeline.test.js` | 3 | **KEEP** tier 2 |
| `kineticConstraintSolver.test.js` | 4 | **KEEP** tier 2 |
| `kineticConstraintGraph.test.js` | 5 | **KEEP** tier 2 |
| `kineticContactManifold.test.js` | 3 | **KEEP** tier 2 |
| `kineticNarrowPhase.test.js` | 9 | **KEEP** tier 2 |
| `kineticPairStream.test.js` | 9 | **KEEP** tier 2 |
| `kineticPairPersistence.test.js` | 4 | **KEEP** tier 2 |
| `kineticIslands.test.js` | 8 | **KEEP** tier 2 |
| `kineticTopologyLifecycle.test.js` | 6 | **KEEP** tier 2 |
| `kineticBodySlab.test.js` | 5 | **KEEP** tier 2 |
| `kineticRollActuator.test.js` | 13 | **KEEP** tier 2 |
| `kineticWallDamage.test.js` | 7 | **KEEP** tier 2 |
| `kineticContactWarmStart.test.js` | 2 | **Merge** into `kineticContactSolver` |
| `kineticEarlyOut.test.js` | 1 | **Merge** into `kineticContactPipeline` |
| `kineticSubstepEarlyOut.test.js` | 1 | **Merge** into `kineticContactPipeline` |
| `wallCandidateBucketSlab.test.js` | 8 | **KEEP** tier 2 (wall damage path) |

Do **not** delete kinetic coverage to save tokens — **consolidate files** instead.

---

## Draw / mock-canvas theater (trim, don’t delete wholesale)

| File | Tests | Verdict |
|------|-------|---------|
| `losShadow.test.js` | 19 | **Mixed:** keep projection/edge math; **trim** mock-canvas op-count / “skips draw when strength 0” cases → tier 2 |
| `maskCompositor.test.js` | 7 | **KEEP** tier 1 — cheap compositor contract |
| `drawShapeParity.test.js` | 11 | **KEEP** tier 1 |
| `wallDamageDraw.test.js` | 4 | **KEEP** tint ratio; cache revision bump is thin |
| `spatialCellMemoryOverlay.test.js` | 3 | **KEEP** — cheap overlay command shape |
| `focusedAgentDebugOverlays.test.js` | 5 | **Tier 2** — debug-only surface |
| `colorVisualOverride.test.js` | 8 | **KEEP** tier 2 |
| `surfaceTextureComposer.test.js` | 4 | **Tier 3** — brittle call-count profiling |
| `sandboxEditorInspector.test.js` | 8 | **Tier 2** — mock DOM `TestElement`, not prod renderer |

---

## Map-gen / procedural / worker slow bucket

| File | Tests | Verdict |
|------|-------|---------|
| `corridorWidthOne.test.js` | 5 | **KEEP** tier 1 — high value |
| `corridorMultiLane.test.js` | 1×seed loop | **Tier 3** |
| `lockedRoom.test.js` | 5 | **KEEP** tier 1 |
| `puzzleTemplateBeltCrate.test.js` | 2 | **KEEP** tier 1 |
| `railMazeDfs.test.js` | 2 | **KEEP** tier 2 |
| `railMazeCorridorBelts.test.js` | 5 | **Tier 3** — documented hang-prone |
| `snakeSplitLayout.test.js` | 2 | **Tier 3** — 256×256 bake |
| `snakeMapGen.test.js` | 3 | **Tier 3** |
| `walkableCells.test.js` | 9 | **KEEP** tier 2 |
| `proceduralFields.test.js` | 9 | **KEEP** tier 2 (minus legacy parity case) |
| `seededNoise2D.test.js` | 5 | **KEEP** tier 2 |
| `roomGraphCorridorRails.test.js` | 1 | **KEEP** tier 2 |
| `tileBakeScheduler.test.js` | 6 | **Tier 3** |
| `tileBakeMetrics.test.js` | 4 | **Tier 3** |
| `tileSurfaceWorkerClient.test.js` | 4 | **Tier 3** |

---

## Full inventory — every test file

Legend: **T1** tier 1 smoke · **T2** tier 2 full suite · **T3** slow/manual · **DEL** delete · **MRG** merge noted · **RW** rewrite dialect/API · **TRM** trim cases

| File | Tests | Verdict | Notes |
|------|-------|---------|-------|
| `activeKineticBodies.test.js` | 9 | T1 | |
| `agentAllyMemory.test.js` | 3 | T2 RW | Delete dual-shape case on H2 |
| `agentAllyPerception.test.js` | 6 | T2 TRM | Keep 1 integration |
| `angleConstraint.test.js` | 2 | T2 | |
| `AStar.test.js` | 6 | T2 | Promote to T1 candidate |
| `bodyMass.test.js` | 8 | T1 | |
| `brain.test.js` | 6 | T2 | |
| `cellTargetHpaNav.test.js` | 12 | T2 | Promote to T1 candidate |
| `chainLinks.test.js` | 6 | T2 | |
| `chainVsWallGrowth.test.js` | 1 | T2 | Baseline fixture — physics.md |
| `chunkFracture.test.js` | 12 | T1 | |
| `collisionDefaults.test.js` | 1 | T2 TRM | Harness-heavy |
| `colorVisualOverride.test.js` | 8 | T2 | |
| `corridorMultiLane.test.js` | 1 | T3 | |
| `corridorWidthOne.test.js` | 5 | T1 | |
| `drawShapeParity.test.js` | 11 | T1 | |
| `eqsScoreOptions.test.js` | 2 | T2 | Small EQS helper — keep |
| `fleeAgentCombat.test.js` | 6 | T2 | |
| `fleeAgentDecision.test.js` | 10 | T2 RW | blackboard dialect |
| `fleeAgentMetabolism.test.js` | 9 | T2 | Dedupe vs snakeStarvation |
| `fleeAgentSpawn.test.js` | 10 | T2 | |
| `fleeBallAsset.test.js` | 1 | **DEL** | |
| `fleePackBlend.test.js` | 4 | T2 | |
| `floorNavEdit.test.js` | 5 | T2 | |
| `flowFieldFrame.test.js` | 5 | T2 | |
| `focusedAgentDebugOverlays.test.js` | 5 | T2 | Debug-only |
| `gameLaunch.test.js` | 7 | T2 RW | Drop getGameLauncher tests |
| `glassFracture.test.js` | 15 | T1 | **Do not cut** — user-visible regression class |
| `goalSeekAutosim.test.js` | 1 | T2 | |
| `gridCellVision.test.js` | 12 | T2 | |
| `gridNavContext.test.js` | 1 | T2 MRG | → `nodeWorkerShim` |
| `gridNavEpoch.test.js` | 2 | T2 | |
| `groundNavArrival.test.js` | 2 | T2 MRG | → merge with snakeNavArrival |
| `hpaBeltNav.test.js` | 1 | T2 MRG | Misnamed floor belt cell test |
| `hpaGroundNavReplan.test.js` | 11 | T1 | |
| `hpaPathSession.test.js` | 3 | T2 | |
| `hpaPathSlot.test.js` | 2 | T2 | |
| `hpaRegionGraph.test.js` | 3 | T2 TRM | Drop legacy pack parity |
| `hpaReplanPrep.test.js` | 3 | T2 | |
| `hpaStitch.test.js` | 2 | T2 | |
| `kineticBodySlab.test.js` | 5 | T2 | |
| `kineticConstraintGraph.test.js` | 5 | T2 | |
| `kineticConstraintSolver.test.js` | 4 | T2 | |
| `kineticContactManifold.test.js` | 3 | T2 | |
| `kineticContactPipeline.test.js` | 3 | T2 MRG | Absorb earlyOut files |
| `kineticContactSolver.test.js` | 12 | T1 | |
| `kineticContactWarmStart.test.js` | 2 | T2 MRG | → solver |
| `kineticEarlyOut.test.js` | 1 | T2 MRG | → pipeline |
| `kineticIslands.test.js` | 8 | T2 | |
| `kineticNarrowPhase.test.js` | 9 | T2 | |
| `kineticPairPersistence.test.js` | 4 | T2 | |
| `kineticPairStream.test.js` | 9 | T2 | |
| `kineticRollActuator.test.js` | 13 | T2 | |
| `kineticSleepProps.test.js` | 7 | T1 | |
| `kineticSubstepEarlyOut.test.js` | 1 | T2 MRG | → pipeline |
| `kineticTopologyLifecycle.test.js` | 6 | T2 | |
| `kineticWallDamage.test.js` | 7 | T2 | |
| `lineOfSight.test.js` | 3 | T1 | |
| `linkCapsuleWall.test.js` | 8 | T2 | |
| `lockedRoom.test.js` | 5 | T1 | |
| `losShadow.test.js` | 19 | T2 TRM | Trim canvas theater; fix npm script |
| `maskCompositor.test.js` | 7 | T1 | |
| `navGraphBeltChain.test.js` | 5 | T2 | |
| `navReachHorizon.test.js` | 7 | T2 | Promote to T1 candidate |
| `navStepPenalty.test.js` | 1 | T2 | |
| `navTopologyParity.test.js` | 1 | T2 | Promote to T1 candidate |
| `navWalkableIndex.test.js` | 2 | T2 | |
| `nodeWorkerShim.test.js` | 4 | T2 | Promote to T1 candidate |
| `policyHysteresis.test.js` | 2 | T2 | Inline optional |
| `poly2D.test.js` | 12 | T1 | |
| `poxelFracture.test.js` | 3 | T1 | |
| `proceduralFields.test.js` | 9 | T2 TRM | Drop legacy hash case |
| `promiseWorkerPoolHost.test.js` | 2 | T2 | Infra |
| `propFracture.test.js` | 6 | T1 | |
| `propScale.test.js` | 3 | T2 | May replace missing vectorProp |
| `puzzleTemplateBeltCrate.test.js` | 2 | T1 | |
| `railMazeCorridorBelts.test.js` | 5 | T3 | Hang-prone |
| `railMazeDfs.test.js` | 2 | T2 | |
| `resolveGroundNavPathOverlayBehavior.test.js` | 2 | **DEL** | |
| `roomGraphCorridorRails.test.js` | 1 | T2 | |
| `sandboxEditorInspector.test.js` | 8 | T2 | Mock DOM |
| `sandboxSceneSnapshot.test.js` | 2 | T2 | **KEEP** — real persistence round-trip |
| `seededNoise2D.test.js` | 5 | T2 | |
| `segment2D.test.js` | 19 | T1 | |
| `shapeFirstProps.test.js` | 5 | T1 | |
| `snakeAutosim.test.js` | 4 | T1 | |
| `snakeCameraFocus.test.js` | 1 | T2 | Small but real UX behavior |
| `snakeDecisionModel.test.js` | 43 | T1 RW | Largest snake unit file; H2 migration |
| `snakeEngagement.test.js` | 4 | T2 MRG | → ally/decision |
| `snakeFood.test.js` | 6 | T2 | |
| `snakeForageIntent.test.js` | 7 | **DEL** MRG | Duplicate of snakeIntent |
| `snakeFsmTransitions.test.js` | 16 | T3 TRM | 594 lines integration sprawl |
| `snakeGameConfig.test.js` | 4 | T2 MRG | Absorb snakeHeadGameplay |
| `snakeGameHarness.test.js` | 1 | **DEL** | |
| `snakeHeadGameplay.test.js` | 1 | T2 MRG | → snakeGameConfig |
| `snakeInstance.test.js` | 5 | T2 | |
| `snakeIntent.test.js` | 9 | T2 TRM | After forage merge |
| `snakeMapGen.test.js` | 3 | T3 | |
| `snakeMinLengthDeath.test.js` | 7 | T2 | |
| `snakeMulti.test.js` | 6 | T2 | Worker stress |
| `snakeNavArrival.test.js` | 4 | T2 MRG | → groundNavArrival |
| `snakePerfBudget.test.js` | 1 | T3 | |
| `snakeScale.test.js` | 3 | T2 | |
| `snakeSegmentFracture.test.js` | 4 | T2 | |
| `snakeSplit.test.js` | 11 | T2 | |
| `snakeSplitLayout.test.js` | 2 | T3 | |
| `snakeStarvation.test.js` | 9 | T2 TRM | Dedupe autosim |
| `snakeTeamRelationship.test.js` | 8 | T2 | |
| `snakeWalkableCells.test.js` | 4 | T2 TRM | |
| `snapNavGoal.test.js` | 3 | T2 | |
| `spatialCellMemoryOverlay.test.js` | 3 | T2 | |
| `spawnLinkedBallChain.test.js` | 7 | T2 | |
| `spawnShapeFamily.test.js` | 3 | T2 | |
| `surfaceTextureComposer.test.js` | 4 | T3 | |
| `targetMemory.test.js` | 5 | T2 | |
| `tileBakeMetrics.test.js` | 4 | T3 | |
| `tileBakeScheduler.test.js` | 6 | T3 | |
| `tileSurfaceWorkerClient.test.js` | 4 | T3 | |
| `triWedgeProp.test.js` | 2 | T1 | |
| `utilityScoring.test.js` | 3 | **DEL** | |
| `walkableCells.test.js` | 9 | T2 | |
| `wallCandidateBucketSlab.test.js` | 8 | T2 | |
| `wallDamageDraw.test.js` | 4 | T2 | |
| `wallDeleteNavPatch.test.js` | 7 | T2 | |
| `wallResolution.test.js` | 5 | T1 | |
| `worldPropPick.test.js` | 4 | T1 | |

**Missing from disk but referenced:** `vectorProp.test.js` (in `npm test` only)

---

## KEEP — do not cut in cleanup passes

Fracture / destruction: `glassFracture`, `chunkFracture`, `propFracture`, `poxelFracture`, `snakeSegmentFracture`

Corridor / puzzle / nav anchors: `corridorWidthOne`, `lockedRoom`, `puzzleTemplateBeltCrate`, `hpaGroundNavReplan`, `nodeWorkerShim`, `navTopologyParity`, `cellTargetHpaNav`, `navReachHorizon`

Core math / spatial: `segment2D`, `poly2D`, `worldPropPick`, `lineOfSight`, `AStar`, `gridCellVision`

Physics contact core: `kineticContactSolver`, `kineticSleepProps`, `activeKineticBodies`, `wallResolution`, `linkCapsuleWall`, `chainLinks`, `bodyMass`

Props / draw: `drawShapeParity`, `shapeFirstProps`, `triWedgeProp`, `maskCompositor`

Persistence (real boundary): `sandboxSceneSnapshot`

---

## Phased cleanup (knock-down order)

### Phase 0 — fix broken scripts (30 min)

1. Remove `vectorProp.test.js` from `npm test` **or** add minimal cache-key test under `propScale` / new file
2. Fix or delete `test:deprecated:losShadow`
3. Add `test:slow` script listing tier 3 files explicitly

### Phase 1 — delete obvious leeches (~15 tests)

Delete: `fleeBallAsset`, `snakeGameHarness`, `utilityScoring`, `resolveGroundNavPathOverlayBehavior`, `snakeForageIntent` (after salvaging unique cases into `snakeIntent`)

Trim: `gameLaunch` getter tests, `hpaRegionGraph` legacy parity, `proceduralFields` legacy hash, `agentAllyMemory` dual-shape

### Phase 2 — merge harness duplicates (~30 tests net reduction)

- `groundNavArrival` + `snakeNavArrival`
- `snakeHeadGameplay` → `snakeGameConfig`
- `snakeEngagement` → `agentAllyMemory` / decision model
- Kinetic micro-files → `kineticContactPipeline` / `kineticContactSolver`
- `gridNavContext` → `nodeWorkerShim`
- Rename `hpaBeltNav` → `floorBeltCell`

### Phase 3 — H2 dialect migration (same PR as prod)

Rewrite all snake/flee decision tests to `decisionContext` only. Delete `createSnakeDecisionBlackboard` from tests. Grep gate clean.

### Phase 4 — tier scripts + promote/demote

Rebuild `npm test` (~40 files):

**Add to T1:** `nodeWorkerShim`, `navTopologyParity`, `snakeDecisionModel` (post-H2), `navReachHorizon`, `AStar`, `cellTargetHpaNav`

**Move to T3:** `snakeSplitLayout`, `railMazeCorridorBelts`, `snakePerfBudget`, `snakeFsmTransitions`, `corridorMultiLane`, `tileBake*`, `surfaceTextureComposer`

### Phase 5 — FSM / starvation trim

Cut duplicate autosim cases from `snakeStarvation` and `snakeFsmTransitions` where `snakeAutosim` + `snakeDecisionModel` already cover behavior. Target: FSM file under 300 lines or tier 3 only.

---

## Target end state

| Metric | Now | Target |
|--------|-----|--------|
| Test files | 126 | ~110 |
| `it()` blocks | ~710 | ~550 |
| Tier 1 files | 25 (1 broken) | ~40 reliable |
| Tier 3 files | 0 (implicit) | ~10 explicit |
| Dual dialect tests | 8 files | 0 |
| Harness-only test files | 1 | 0 |
| Broken npm scripts | 2 | 0 |

---

## Verify after each phase

```text
node scripts/run-tests.mjs tests/<changed>.test.js     # targeted
npm test                                                # tier 1
npm run test:slow                                       # tier 3 manual
rg createSnakeDecisionBlackboard tests/
rg getGameLauncher tests/
```

**Do not** run full `test:all` in agent wrap-up unless the change touches global test infra or the user asks.
