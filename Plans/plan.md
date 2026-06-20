PR 1 — Nav-walkable bitmask (ROADMAP §4.1)
Replace the string-key Set walkability cache with a dense per-cell flag (plus the existing cells[] list for random picks), keyed off obstacleGeneration and patchable via damageBounds the same way GridNavContext already does for navCardinalOpen. Every hot caller (navWalkable.has, isNavWalkableCellAt, belt filtering, spawn checks) becomes O(1) index lookup with no allocations; include rebake-on-epoch tests and a quick snake perf check so you have the deletion-friendly substrate everything else depends on.

PR 2 — Link capsule wall culling (physics proving ground)
Optimize projectIslandLinkCapsulesAgainstWalls / projectDistanceLinkCapsuleAgainstWalls with link-AABB filtering against the frame’s wall-candidate buckets, reuse/clear the per-island walls[] buffer, and skip work for asleep or nearly-static links. This is pure snake-chain physics perf (~17% of your profile) and doesn’t change gameplay — just keeps 70-snake sim headroom before you add wall impacts.

PR 3 — Trilogy C1: manifolds + substep early-out ✅
Finish the partial contact stack: feature-id keyed manifold warm-start, reduced re-solving on resting contacts, and substep early-out when impulses are negligible. Helps all kinetic piles (snake segments, striker, debris) and is independent of walls — land it before striker starts adding new contact traffic.

PR 4 — Wall health + striker breakage + localized nav delete
Add health on voxel fill and rail-wall edges (max HP per stamp type, damage on striker impact above speed threshold), clear geometry at 0 HP through existing grid/boundary APIs, and call onObstaclesChanged(damageBounds) so HPA region patch + PR 1’s walkable bitmask update only the broken region. Striker keeps snake-split behavior; this PR adds wall damage/deletion as the gameplay hook that stress-tests incremental nav.

PR 4 SPLIT: Yes — split it. The work is really two layers: (1) grid delete + nav invalidation plumbing that must behave exactly like editor delete, and (2) striker combat rules on top. The first is easy to test without gameplay (quiet voxel batch clear mirroring clearRailWallsQuiet, union damageBounds, single deferred commitBoundaryEdit/notifyGridWallChange per tick, plus PR 1’s regional patchNavWalkableCellIndex(damageBounds) wired into the existing onObstaclesChanged hook). The second depends on the first but adds sparse damage storage, max-HP-from-stamp lookup, variable impact from wall hits, and the striker hook in setupSnakeGame. Merging them means you’re debugging HPA region patch, walkable bitmask patch, and striker tuning in one review — same mistake as stuffing enabled/persistPairs into the contact PR.

PR 4a — “Wall delete batching + localized nav”: Add clearVoxelWallQuiet + batch commit (rails already have this pattern), end-of-tick damageBounds accumulator, regional patchNavWalkableCellIndex(damageBounds), tests that delete voxels/rails programmatically and assert gridNavContext + walkable flags + HPA patch only touch the damaged rect (no striker, no health map). PR 4b — “Striker wall damage”: Sparse wallDamage map (create-on-first-hit only), impact → damage formula, on 0 HP call the same quiet clears from 4a and feed the same deferred commit; snake-split unchanged. 4a ships the contract nav cares about (“wall gone = editor delete”); 4b only decides when that fires. If 4a slips, 4b can still land with per-delete notify and full walkable rebake temporarily, but you’d lose the main perf win you’re chasing.

PR 5 — Damage overlay (render)
Wire the health store into wall draw: face + cap/roof tint from 1 - health/maxHealth (white → red), using the ProjectedWallDraw hook that’s already documented for “optional damage overlay.” Invalidate baked wall sprites when health changes in a cell bounds rect so you’re not redrawing the whole map each frame.

PR 6 — Ground nav arrival fix + snake-mode path debug
Fix HPA and flow ground-nav so right-click “move here” actually releases the target at arrival (cell-centered stop, belt-aware release, no endless replan/locomotion) — likely shared with cellTargetHpaNav arrival rules. In snake mode, draw path overlays for any prop under manual HPA/flow nav (reuse appendPathOverlayCommands / behavior getPathOverlay, not only the FSM debug flag) so you can right-click a test ball through a maze, punch holes with the striker, and visually confirm routes update after PR 4.

## PR 1 POST MORTEM

PR 1 status. Yes — PR 1 is effectively landed. Hot navWalkable.has / isNavWalkableCellAt go through a dense Uint8Array in navWalkableIndex.js and walkableCells.js, flood-fill uses reusable masks instead of string-key Sets, createNavWalkableAccess keeps the cells[] list for random picks, and NavigationService.setNavWalkableSyncHook + patchNavWalkableCellIndex rebake on obstacle epoch (wired from setupSnakeGame). Tests cover bitmask read/write, epoch rebake, and snakePerfBudget.test.js still passes with createTestNavigation. What PR 1 did not fully deliver is regional invalidation: the hook still full-rebakes the snake bounds cache, it doesn’t yet patch only damageBounds cells — that’s the natural follow-on once PR 4 starts deleting walls. Before PR 2 there’s no urgent deletion work: walkableCellKey + excludeKeys Sets are cold-path spawn helpers, and collectWalkableCells / \_walkableCellsCache is a separate editor “open floor” cache, not dead nav code. Optional pre-PR-2 housekeeping: mark PR 1 done in Plans/plan.md / ROADMAP §4.1, and note the two-cache split so nobody tries to “merge” them.

Snake lean vs libraries. The shape is mostly right: gameLaunchers.js is thin, setupSnakeGame is session glue (camera, HUD, autosim loop, contact hooks), movement/planning lives in cellTargetHpaNav, createSnakeForageIntent (AI library), and sandbox chain/spawn primitives. The ~26 files under Libraries/Game/snake are not all bloat — combat, starvation, striker, lifecycle, and config are legit game rules. The real weight is snakeScene.js: it owns cavern/rail generation, belt stamping, spawn layout, and goal pools, and it imports Apps/Editor/world/mapWorld.js, which is the main decouple debt (game library → editor app). Second tier: four debug overlay modules plus ground-nav overlay wiring in setupSnakeGame — fine while iterating, but they’re optional chrome that could live behind config or a single snakeDebugOverlays.js barrel. Thin game wrappers like snakeExplore, snakeBeltCells, and snakeNavArrival are appropriate; they encode snake-specific policy on top of generic nav/explore APIs.

Drift between snake game and editor. Runtime drift is low by design: snake mode still runs the same sandbox controller, ground-nav behaviors, runKineticPhysics, HPA workers, and overlay pipeline as the editor — playMode mostly hides selection rings and room-graph chrome. Intentional snake-only additions are appLaunch.session.tick (autosim before controller tickWorld), combat/striker contact side effects, and HUD/camera focus. The meaningful divergence is content pipeline, not sim: both paths generate maps through mapWorld, but only snake bundles that into spawnSnakeCavernScene. Editor users place props; snake auto-spawns chains, goals, and nav-walkable bounds. Recent ground-nav path overlays bridged another gap (manual HPA/flow debug in snake without FSM flags) via library helper resolveGroundNavPathOverlayBehavior — good pattern: behavior in libraries, one hook in setupSnakeGame.

PR 2 plan. Link capsule wall culling is the next pure perf win in kineticConstraintSolver.js: projectIslandLinkCapsulesAgainstWalls already skips asleep islands and gatherLinkWallCandidates already pulls from the frame’s wall-candidate buckets, but it still re-gathers and re-scans per link inside each island (walls.length = 0 every constraint). PR 2 is: hoist/reuse a per-island walls[] buffer, tighten broadphase so each link capsule AABB filters wall segments before narrow getLinkCapsuleSegmentPenetration, and early-out links that are asleep or below a velocity threshold. No gameplay change — it protects 70-snake headroom (~17% of your profile) before PR 4 adds striker wall impacts and more contact traffic. It’s independent of PR 1; PR 1’s bitmask just needs the existing rebake hook extended to bounded regions when wall deletion lands in PR 4.

## PR 2 POST MORTEM

Easy wins still sitting in those files (low risk, optional before PR 3)

Belt-and-suspenders on WorldObstacleGrid.canStep — if there’s no navGridFrame/navTopology and gridNavContext is null/undefined, return false instead of throwing. That turns “mystery crash” into “waypoint doesn’t advance,” which is easier to debug if another caller forgets context.
buildReplanParams / applyHpaReplanResult — gridNavContext is optional with a null default. A dev assert (or test-only check) when applying a replan with a real path would catch regressions like the one you just hit.
PR 2 has one more slice if profiling still shows link-capsule cost: island gather is deduped per body now, but each link still scans the full island wall list. A per-link pre-pass that keeps only segments overlapping that link’s capsule AABB (from the shared island list) is a small follow-up, not a redesign.
Docs only — mark PR 1 + PR 2 done in Plans/plan.md / ROADMAP so PR 3 doesn’t get planned against stale “partial” status.
Not worth doing before PR 3

Merging cellTargetHpaNav and hpaGroundNavSession — same HPA session underneath, but snake FSM arrival vs sandbox right-click nav are different policies; unifying is a medium refactor, not a quick win.
Regional patchNavWalkableCellIndex(damageBounds) — belongs with PR 4 wall deletion; full rebake is fine until then.
PR 6 ground-nav arrival unification for cellTargetHpaNav — sandbox HPA/flow/drive-clear is done; snake heads use cell-based FSM arrival (snakeNavArrival.js), which is a separate behavioral pass.
What PR 3 actually is (and what’s already there)

PR 3 is physics contact stack, not pathfinding: feature-id manifold warm-start, less re-solving on resting contacts, substep early-out when impulses are negligible. You already have partial pieces — impulse-decay warm-start in kineticContactSolver.js, outer-iteration early-out in collisionPipeline.js and constraint solve — but no substep early-out in kineticPhysicsPass.js (it always runs all motion substeps), and manifolds are still mostly single-point. That’s the right next chunk; pathfinding/HPA files are in decent shape for it.

Practical recommendation

Ship PR 3 next without more pathfinding work. The only pre-PR-3 code I’d actually consider is the canStep guard + a replan apply test that exercises gridNavContext end-to-end (you have hpaPathSlot.test.js now; an async applyHpaReplanResult smoke would close the loop). Everything else is either PR 4 (nav patch + walls), PR 6 polish (arrival parity), or physics perf you’re about to touch anyway in C1.

## PR 3 POST MORTEM

PR 3 status. Landed. `kineticContactManifold.js` adds feature-id keyed warm-start (`contactWarmStartKey` quantizes contact normal into 16 angle bins). `kineticContactSolver.js` stores/restores impulses per feature key, flags resting contacts from relative normal/tangent pre-velocity, skips re-solve iterations for resting contacts (and breaks early when all contacts are resting), and routes circle–circle pairs through a dedicated impulse lane using precomputed lever arms. `kineticPhysicsPass.js` early-outs remaining motion substeps when active bodies fall below `kineticEarlyOut.velocityEpsilonSq`; stats land on `session.motionSubstepStats`. Defaults in `collisionDefaults.js`: `kineticResting`, `substepEarlyOut`. Tests: `kineticContactManifold.test.js`, `kineticContactWarmStart.test.js`, `kineticSubstepEarlyOut.test.js`. Multi-point manifolds remain future work (still single-point SAT); this PR is warm-start persistence + resting/substep polish per Trilogy C1.

The manifold work is done for C1 scope — feature-keyed warm-start, resting fast-path, and substep early-out are in and the config/branch cruft is gone. What you have is still single-point contact with normal-angle quantization as the “feature id,” not real SAT feature persistence (vertex/edge ids, multi-point manifolds, clip points). That’s the big remaining item on the roadmap and it’s a proper physics feature, not a cleanup. Same bucket: warm-start cache still wipes and rebuilds every contact pass (warmStartKeys.fill(0) then re-store) — fine for now, but true manifold persistence would keep per-pair slots across frames without full clear and support multiple points per pair.

Easy wins / dedupes still sitting there: applyCircleCircleContactImpulse and applyGenericContactImpulse are byte-for-byte the same — the “circle impulse lane” is just a duplicated function and a tier branch in the solve loop; one applyContactImpulse would do. contacts.pairKey is only used to build warmStartKey — you could drop the array and compute inline. lastKineticContactSolveStats is a test/debug export on the hot module; could live on tick.world.kinetic or test-only. preSpeedA/preSpeedB are still filled every contact (striker uses them) — keep those. Minor: kineticContactManifold.js JSDoc still mentions removed maxBodySpeed. None of this blocks shipping; the only meaningful “manifold v2” left is multi-point + real feature ids, which is Trilogy C follow-on, not a dedupe pass.

## PR 4 POST MORTEM

4a only built the plumbing so wall removal works like editor delete and nav updates correctly:

Quiet/batch delete for voxel + rail (clearGridWallsQuiet, clearGridWallsBatch)
Deferred commit (createDeferredGridWallCommit) so many hits can flush once per tick
Regional patchNavWalkableCellIndex(state, damageBounds) on obstacle change
Nothing in the striker or wall-hit path calls those yet. Tests delete walls programmatically to prove the contract.

4b is where behavior lands:

Sparse wallDamage (only when a wall has been hit)
Striker hook in setupSnakeGame.js / snakeStriker.js on wall impacts
Variable damage from hit speed/angle
At 0 HP → clearGridWallsQuiet / deferred flush → same commitBoundaryEdit path 4a added

## PR 5 FOLLOW ONS

PR A — Universal kinetic wall damage: Drop the striker-only gate (entity.id === strikerBall.id) and the passthrough wrappers in snakeStriker.js (resolveStrikerBallWallDamageFromHits, flushStrikerWallDamage, createSnakeStrikerWallDamage) so any body that wall-resolves with preSpeed above the floor queues hits through one path: queueWallHits → deferred flush → applyPendingWallDamage. Hoist that into simulationKineticHooks when state.sandbox.gridWallDamage exists (resolve + afterKineticPhysics flush), so setupSnakeGame only creates the session and doesn’t own physics plumbing. Keep the existing speed + approachDot formula (not mass-based); snakes off belts, striker, and debris all share wallDamage config. Add a test that a non-striker kinetic body at max impact destroys a wall in three hits. Performance stays fine — wall resolve is already once per body per frame, and per-wall max-damage-per-tick batching prevents pile-on spam.

PR B — Wall-damage cleanup and naming: Collapse the duplicate session aliases (state.sandbox.gridWallDamage and state.sandbox.snakeGame.strikerWallDamage) and the dual lookup in getGridWallDamageSession to a single canonical home. Rename striker-prefixed APIs (queueStrikerWallHits, applyPendingStrikerWallDamage, computeStrikerWallDamage) to neutral names; move session creation out of snakeStriker.js into gridWallDamage.js / sandbox setup where it belongs. Unify config drift: wallDamage.minStrikeSpeed and strikerMinStrikeSpeed are both 28 today — either one shared constant or a documented link so split threshold and wall damage don’t silently diverge; revisit referenceMaxSpeed: 560 (striker max) vs headMaxSpeed: 250 so belt-boosted snakes have an intentional damage ceiling. Merge overlapping invalidation: invalidateWallDamageDraw and invalidateWallAtlasKeyMemos both blow static wall/rail draw caches — one entry point, regional bounds for damage tint vs full invalidation on geometry delete. Minor smells to sweep while in there: resolveStrikerBallWallDamageFromHits taking strikerBall only to null-check it, snake-only test file name (strikerWallDamage.test.js), and commitBoundaryEdit still firing notifyGridWallChange per region in a loop if a batch ever passes multiple rects (pre-existing, but worth fixing if touched).
