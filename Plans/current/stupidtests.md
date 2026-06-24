# Stupid tests audit

**Situation:** ~115 test files · ~660 `it()` blocks · `npm test` = 25-file tier-1 smoke · `npm run test:all` = everything · `npm run test:slow` = hang-prone bucket · 5s/test timeout via `run-tests.mjs`.

**Infra:** setup/teardown in `tests/testPreload.js` (`--import` from runner). `tests/nodeCanvasSetup.js` is a no-op stub — keep imports, don’t put hooks there.

**Snake AI cluster (current):** `snakeDecisionModel` (unit + hysteresis) · `snakeIntent` (explore + integration) · `agentAllyMemory` (memory + engagement) · `agentAllyPerception` (1 autosim) · plus `snakeAutosim` / `snakeStarvation` / `fleeAgentDecision` / `fleePackBlend`.

**Rule of thumb (same as [`stupid.md`](stupid.md)):** tests use the **production dialect** or get updated in the same PR. Never keep prod shims so tests can lag. Never add tests that only assert registry/getter/harness wiring.

**Related:** [`stupid.md`](stupid.md) · [`library_defaults.md`](library_defaults.md) · `.cursor/rules/test-runs-targeted.mdc`

---

## Step 1 — Kinetic micro-files → consolidate

20 kinetic files · ~120 tests — coverage is good; file count is stupid.

| Merge into `kineticContactSolver.test.js` | `kineticContactWarmStart.test.js` (2) |
| Merge into `kineticContactPipeline.test.js` | `kineticEarlyOut.test.js` (1), `kineticSubstepEarlyOut.test.js` (1) |

Do **not** delete solver coverage — move describes, delete empty files.

---

## Step 2 — `snakeFsmTransitions` tier-3 trim

~594 lines · 16 integration cases · many overlap `snakeAutosim`, `snakeIntent`, `snakeDecisionModel`.

**Action:** cut cases already covered elsewhere; keep only mode transitions that require full harness + worker nav and aren’t asserted in the slimmed snake files. Target under 300 lines or tier-3-only forever.

Already in `npm run test:slow` — don’t promote to tier 1.

---

## Step 3 — Tier hygiene

**Tier 1 (`npm test`) today:** corridor, math, fracture suite, locked-room, puzzle template, kinetic core, props/draw, `floorBeltCell`, `nodeWorkerShim`, `gameLaunch`, `propScale`.

**Promote to tier 1:** `snakeDecisionModel`, `navTopologyParity`, `flowTargetSteps`, `AStar`, `cellTargetHpaNav`

**Tier 3 (`npm run test:slow`):** `snakeSplitLayout`, `railMazeCorridorBelts`, `snakePerfBudget`, `snakeMapGen`, `snakeFsmTransitions`, `corridorMultiLane`, `tileBake*`, `surfaceTextureComposer`

**Delete / demote candidates:**

| File | Verdict |
|------|---------|
| `collisionDefaults.test.js` | Delete unless LD-* defaults need a dedicated file |
| `snakeWalkableCells.test.js` | Keep 1 case in `snakeMapGen`; delete rest |
| `sandboxEditorInspector.test.js` | Tier 2 or delete — mock DOM |
| `focusedAgentDebugOverlays.test.js` | Tier 2 — debug-only |

---

## Step 4 — Draw / mock-canvas trim

| File | ~Tests | Action |
|------|--------|--------|
| `losShadow.test.js` | 19 | Keep projection/edge math; delete mock-canvas op-count theater |
| `wallDamageDraw.test.js` | 4 | Keep tint ratio; cache-revision bump is thin |
| `surfaceTextureComposer.test.js` | 4 | Tier 3 — call-count profiling |

---

## Step 5 — Flee agent sprawl review

| File | ~Tests | Notes |
|------|--------|-------|
| `fleeAgentSpawn.test.js` | 10 | Keep if spawn is complex |
| `fleeAgentMetabolism.test.js` | 9 | Dedupe vs `snakeStarvation` patterns |
| `fleeAgentCombat.test.js` | 6 | Keep |
| `fleeAgentDecision.test.js` | 10 | Keep species scoring |
| `fleePackBlend.test.js` | 4 | Keep — flee-specific pack blend |

---

## Organization rules

### Three tiers

```text
Tier 1 — smoke     npm test
Tier 2 — full      npm run test:all
Tier 3 — slow      npm run test:slow
```

**Tier 1 bar:** prod-path regression · reliable under 5s/test · no 256×256 worker bake unless the feature *is* that bake (corridor/locked-room excepted).

**Agent rule:** don’t run `npm test` or `test:all` as default wrap-up; run **one file** when the change touches that domain.

### Add-test gate

1. Existing file already covers it? → extend, don’t fork.
2. Asserting shape/getter/dual dialect? → don’t add.
3. Worker + big bake? → tier 3.
4. Deleting it leaves zero user-visible regression class? → don’t add.

---

## Full inventory

Legend: **T1** tier 1 · **T2** tier 2 · **T3** tier 3 · **TRM** trim · **MRG** merge

| File | Tier | Notes |
|------|------|-------|
| `activeKineticBodies.test.js` | T1 | |
| `agentAllyMemory.test.js` | T2 | Memory + engagement |
| `agentAllyPerception.test.js` | T2 | 1 autosim integration |
| `angleConstraint.test.js` | T2 | |
| `AStar.test.js` | T2 → T1 | |
| `bodyMass.test.js` | T1 | |
| `brain.test.js` | T2 | |
| `cellTargetHpaNav.test.js` | T2 → T1 | |
| `chainLinks.test.js` | T2 | |
| `chainVsWallGrowth.test.js` | T2 | Baseline fixture |
| `chunkFracture.test.js` | T1 | |
| `collisionDefaults.test.js` | T2 | Delete candidate |
| `colorVisualOverride.test.js` | T2 | |
| `corridorMultiLane.test.js` | T3 | |
| `corridorWidthOne.test.js` | T1 | |
| `drawShapeParity.test.js` | T1 | |
| `eqsScoreOptions.test.js` | T2 | |
| `fleeAgentCombat.test.js` | T2 | |
| `fleeAgentDecision.test.js` | T2 | |
| `fleeAgentMetabolism.test.js` | T2 | Dedupe vs snakeStarvation |
| `fleeAgentSpawn.test.js` | T2 | |
| `fleePackBlend.test.js` | T2 | |
| `floorBeltCell.test.js` | T1 | |
| `floorNavEdit.test.js` | T2 | |
| `flowFieldFrame.test.js` | T2 | |
| `focusedAgentDebugOverlays.test.js` | T2 | Debug-only |
| `gameLaunch.test.js` | T1 | |
| `glassFracture.test.js` | T1 | Do not cut |
| `goalSeekAutosim.test.js` | T2 | |
| `gridCellVision.test.js` | T2 | |
| `gridNavEpoch.test.js` | T2 | |
| `groundNavArrival.test.js` | T2 | |
| `hpaGroundNavReplan.test.js` | T1 | |
| `hpaPathSession.test.js` | T2 | |
| `hpaPathSlot.test.js` | T2 | |
| `hpaRegionGraph.test.js` | T2 | |
| `hpaReplanPrep.test.js` | T2 | |
| `hpaStitch.test.js` | T2 | |
| `kineticBodySlab.test.js` | T2 | |
| `kineticConstraintGraph.test.js` | T2 | |
| `kineticConstraintSolver.test.js` | T2 | |
| `kineticContactManifold.test.js` | T2 | |
| `kineticContactPipeline.test.js` | T2 MRG | Absorb earlyOut files |
| `kineticContactSolver.test.js` | T1 MRG | Absorb warmStart |
| `kineticContactWarmStart.test.js` | T2 MRG | → solver |
| `kineticEarlyOut.test.js` | T2 MRG | → pipeline |
| `kineticIslands.test.js` | T2 | |
| `kineticNarrowPhase.test.js` | T2 | |
| `kineticPairPersistence.test.js` | T2 | |
| `kineticPairStream.test.js` | T2 | |
| `kineticRollActuator.test.js` | T2 | |
| `kineticSleepProps.test.js` | T1 | |
| `kineticSubstepEarlyOut.test.js` | T2 MRG | → pipeline |
| `kineticTopologyLifecycle.test.js` | T2 | |
| `kineticWallDamage.test.js` | T2 | |
| `lineOfSight.test.js` | T1 | |
| `linkCapsuleWall.test.js` | T2 | |
| `lockedRoom.test.js` | T1 | |
| `losShadow.test.js` | T2 TRM | Canvas theater |
| `maskCompositor.test.js` | T1 | |
| `navGraphBeltChain.test.js` | T2 | |
| `flowTargetSteps.test.js` | T2 | |
| `navStepPenalty.test.js` | T2 | |
| `navTopologyParity.test.js` | T2 → T1 | |
| `navWalkableIndex.test.js` | T2 | |
| `nodeWorkerShim.test.js` | T1 | |
| `poly2D.test.js` | T1 | |
| `poxelFracture.test.js` | T1 | |
| `proceduralFields.test.js` | T2 | |
| `promiseWorkerPoolHost.test.js` | T2 | |
| `propFracture.test.js` | T1 | |
| `propScale.test.js` | T1 | |
| `puzzleTemplateBeltCrate.test.js` | T1 | |
| `railMazeCorridorBelts.test.js` | T3 | Hang-prone |
| `railMazeDfs.test.js` | T2 | |
| `roomGraphCorridorRails.test.js` | T2 | |
| `sandboxEditorInspector.test.js` | T2 | Mock DOM |
| `sandboxSceneSnapshot.test.js` | T2 | Persistence boundary |
| `seededNoise2D.test.js` | T2 | |
| `segment2D.test.js` | T1 | |
| `shapeFirstProps.test.js` | T1 | |
| `snakeAutosim.test.js` | T1 | |
| `snakeCameraFocus.test.js` | T2 | |
| `snakeDecisionModel.test.js` | T1 | Unit + hysteresis |
| `snakeFood.test.js` | T2 | |
| `snakeFsmTransitions.test.js` | T3 TRM | Step 2 |
| `snakeGameConfig.test.js` | T2 | |
| `snakeInstance.test.js` | T2 | |
| `snakeIntent.test.js` | T2 | Explore + integration |
| `snakeMapGen.test.js` | T3 | |
| `snakeMinLengthDeath.test.js` | T2 | |
| `snakeMulti.test.js` | T2 | |
| `snakePerfBudget.test.js` | T3 | |
| `snakeScale.test.js` | T2 | |
| `snakeSegmentFracture.test.js` | T2 | |
| `snakeSplit.test.js` | T2 | |
| `snakeSplitLayout.test.js` | T3 | |
| `snakeStarvation.test.js` | T2 | Metabolism only |
| `snakeTeamRelationship.test.js` | T2 | |
| `snakeWalkableCells.test.js` | T2 TRM | |
| `snapNavGoal.test.js` | T2 | |
| `spatialCellMemoryOverlay.test.js` | T2 | |
| `spawnLinkedBallChain.test.js` | T2 | |
| `spawnShapeFamily.test.js` | T2 | |
| `surfaceTextureComposer.test.js` | T3 | |
| `targetMemory.test.js` | T2 | |
| `tileBakeMetrics.test.js` | T3 | |
| `tileBakeScheduler.test.js` | T3 | |
| `tileSurfaceWorkerClient.test.js` | T3 | |
| `triWedgeProp.test.js` | T1 | |
| `walkableCells.test.js` | T2 | |
| `wallCandidateBucketSlab.test.js` | T2 | |
| `wallDamageDraw.test.js` | T2 | |
| `wallDeleteNavPatch.test.js` | T2 | |
| `wallResolution.test.js` | T1 | |
| `worldPropPick.test.js` | T1 | |

---

## Do not cut

Fracture: `glassFracture`, `chunkFracture`, `propFracture`, `poxelFracture`, `snakeSegmentFracture`

Corridor / puzzle / nav: `corridorWidthOne`, `lockedRoom`, `puzzleTemplateBeltCrate`, `hpaGroundNavReplan`, `nodeWorkerShim`, `navTopologyParity`, `cellTargetHpaNav`, `flowTargetSteps`

Math / spatial: `segment2D`, `poly2D`, `worldPropPick`, `lineOfSight`, `AStar`, `gridCellVision`

Physics: `kineticContactSolver`, `kineticSleepProps`, `activeKineticBodies`, `wallResolution`, `linkCapsuleWall`, `chainLinks`, `bodyMass`

Props / draw: `drawShapeParity`, `shapeFirstProps`, `triWedgeProp`, `maskCompositor`, `propScale`

Persistence: `sandboxSceneSnapshot`

---

## Target end state

| Metric | Now | Target |
|--------|-----|--------|
| Test files | ~115 | ~105 |
| `it()` blocks | ~660 | ~550 |
| Tier 1 files | 25 | ~30 |
| Kinetic micro-files (1–2 tests) | 4 | 0 |
| Snake AI test files | 5 core | 5 (stable) |

---

## Verify (targeted only)

```text
node scripts/run-tests.mjs tests/kineticContactSolver.test.js
node scripts/run-tests.mjs tests/snakeFsmTransitions.test.js
npm run test:slow
```

Do **not** run full `test:all` or `npm test` as agent wrap-up unless the change touches test infra or the user asks.

**Stale plan refs to fix when touching those docs:** `Plans/procedural.md` → `walkableCells.test.js`; `Plans/games/snake.md` / `Plans/library-audit.md` → old snake test file list.
