# todo

---

## CURRENT TASK: PORTALS

3-part plan: guaranteed portal enter/exit for props
End goal: A prop approaching a powered, linked portal from the mouth side always traverses (or cleanly rejects). Landing on the partner side is stable — no bounce-back, no trap in the back cell, no reliance on nav hacks to "finish" the crossing.

Design principle: One owner for crossing — physics intake at portal contact. Pathfinding only routes to the mouth; it never performs the teleport.

Part 1 — Portal intake at wall contact
Problem today: Traverse is a post-physics side channel (\_portalPrevCellIdx cell-diff) that races with collision. Nav gets you to the mouth; something else has to magically fire.

Goal: When a prop touches a portal segment from the allowed side, evaluate and traverse in the same frame, before collision pushes it away.

1.1 Add tryPortalIntake in portalAccess.js / new colocated logic in portalTraverse.js
Single entry point, roughly:

tryPortalIntake(state, entity, segment) → { traversed: boolean }
Inputs:

segment.gridCol/Row/Side + segment.passageEdge (canonical emit owner from WorldObstacleGrid)
Entity x, y, radius, vx, vy
Checks (reuse existing gates):

evaluatePortalStepEntry preconditions (powered, linked, one-way route, network)
Mouth-side test: body is on the mouth half-plane, not just center cell
Mouth-side geometry (replace center-cell + velocity dot):

Compute portal plane from gridWallEdgeEndpoints
Mouth cell from portalMouthAndBackCells
Allow contact if body center (or nearest point on circle) is in mouth cell or within radius of mouth-side plane
Crossing intent: velocity dot or displacement since last frame toward plane (covers slow rolls / post-bounce)
On pass → call applyPortalTraverse immediately.

1.2 Hook intake in wallResolution.js
In resolveBodyAgainstWallSegments, for portal segments:

if (isPortalEdge) {
if (tryPortalIntake(...)) continue; // skip collision — we're gone
if (!portalEdgeBlocksCollision(...)) continue;
}
Intake runs before the collision push-out. Back-side and wrong-side bodies still hit the full rail.

1.3 Soften mouth collision gate
Update portalEdgeBlocksCollision:

Use portalMouthAllowedSide consistently (fix edge.allowedSide mismatch)
For mouth-zone bodies: skip collision when crossing intent is present (velocity or displacement), not vx·cross > 0.5 alone
Back cell / wrong side: always block (unchanged — this is the "physics on the back part" you want to keep)
1.4 Demote tickPortalTraverse cell-diff
Keep tickPortalTraverse temporarily as a fallback only for edge cases intake might miss (e.g. teleport without wall contact that frame). Primary path is intake. Mark for deletion in Part 2.

Part 1 done when
Manual push/roll into mouth from allowed side traverses reliably at low and high speed
Back side still blocks
No change to nav yet
Files: portalAccess.js, portalTraverse.js, wallResolution.js

Part 2 — Exit contract and state cleanup
Problem today: Successful traverse snaps to partner mouth center with no preparation; failed traverse advances \_portalPrevCellIdx and traps the prop in the back cell.

Goal: Every traverse produces a clean landing; every rejection leaves the prop in a recoverable state.

2.1 applyPortalTraverse exit preparation
In applyPortalTraverse:

Pre-check exit — blocked partner mouth → return false before mutating position
Place past the plane — exit position = partner mouth center + offset along exit crossing vector × (radius + small pad) so the body clears the partner back rail on frame 1
Velocity — preserve speed, redirect along exit crossing direction (optional tangent zeroing)
Cache — invalidateWallResolveCache(entity) after teleport
Cooldown — keep \_portalTraverseUntil (prevents instant re-entry bounce)
2.2 Reject, don't trap
In intake / traverse failure paths:

If entry evaluated but applyPortalTraverse fails → do not advance \_portalPrevCellIdx to back cell
Optionally nudge back into mouth along crossing vector
2.3 Delete the cell-diff primary path
Once intake is solid:

Remove tickPortalTraverse cell-crossing loop (or reduce to init-only for \_portalPrevCellIdx if still needed elsewhere)
Remove \_portalPrevCellIdx as traverse driver; keep only if belt/zone code needs it (it doesn't — that's \_gridZonePrevCellIdx)
Delete velocity-only collision exemption if mouth-zone geometry covers it
Wire or remove dead accessBlock config
2.4 Tick order stays the same
runPushablePhysics → intake fires inside wall resolve → tickGridZones no longer owns traverse. \_gridZonePrevCellIdx still synced on successful traverse to avoid false belt/tripwire events.

Part 2 done when
Post-teleport prop never immediately hits partner back wall
Blocked exit rejects cleanly at mouth
\_portalPrevCellIdx cell-diff path is gone
No dual traverse paths left
Files: portalTraverse.js, portalAccess.js, gridZoneTick.js, WallCollisionResolver.js, possibly CellEdge.js (accessBlock)

Part 3 — Nav alignment and end-to-end guarantee
Problem today: Nav plans a graph hop (A→partner B) but rewrites the path to mouth-only and hopes physics completes the hop. \_portalNavDirty is a band-aid replan.

Goal: Nav routes to the mouth; intake guarantees the crossing; replan is a normal "I arrived somewhere new" event, not a recovery mechanism.

3.1 Simplify portal path expansion
In expandPortalHopsInCellPath (portalNavIndex.js):

Keep mouth waypoint insertion (prop must physically reach mouth)
Document new contract: "traverse is guaranteed at mouth contact; exit waypoint omitted because position jumps"
Optionally add a pre-mouth approach point one cell before mouth (reduces head-on collision with edge rail at shallow angles) — only if Part 1 still has angle edge cases
3.2 HPA / A\* stays mostly as-is
buildPortalNavHops, forEachPortalNavHop, canPortalHop — keep; graph topology is correct
rollToCursorHpaBehavior \_portalNavDirty → force replan after traverse (still needed; rename to something honest like \_navPathStale if you want)
Replan should be the only post-traverse nav action — no special mouth-exit waypoint dance
3.3 canStep / boundary alignment
Verify WorldObstacleGrid.canStep and boundaryBlocksStepFrom agree with intake gates (same evaluatePortalStepEntry / portalBlocksStepFrom). Nav shouldn't plan through a portal physics would reject.

3.4 Test matrix (props only)
Scenario Pass criteria
Roll-to-cursor through linked portal
Path → mouth → teleport → replan → reach target
Slow push into mouth
Traverses without repeated bouncing
Fast roll into mouth
No miss due to cell skipping
Shallow angle approach
Intake still fires (displacement intent)
Blocked partner exit
Rejects at mouth, prop recoverable
One-way reverse
Blocked, no traverse
Unpowered portal
Solid, nav doesn't plan hop
Immediate post-exit movement
No partner back-rail spike
Back-side push
Blocked (physics only)
Part 3 done when
rollToCursorHpa reliably routes through portals to distant targets
No nav code assumes cell-diff traverse
Portal hop comment/hack in portalNavIndex.js reflects the real contract
Files: portalNavIndex.js, rollToCursorHpaBehavior.js, HierarchicalNavigator.js, WorldObstacleGrid.js

Summary
Part Owns Removes
1 — Intake at contact
tryPortalIntake in wall resolve; mouth-zone geometry
Velocity-only gate as sole mouth pass
2 — Exit contract
Placement offset, velocity, cache invalidation, clean reject
\_portalPrevCellIdx traverse loop, dual paths
3 — Nav alignment
Mouth waypoint + replan-on-teleport
"Hope physics fires" implicit contract
Part 1
Part 2
Part 3
Nav steers to mouth
Wall contact
tryPortalIntake
applyPortalTraverse with exit offset
Clean landing on partner mouth
\_navPathStale replan
Continue to target
Parts are sequential — each builds on the last. Part 1 alone should fix most manual "why won't it go through" pain; Parts 2–3 make it guaranteed for navigating props end-to-end.

---

## Passage power network — checklist

- [ ] **Chain draw** — Beam static occupancy draw? Will need to reassess how all floorprops and static occupancy props are drawn, right now it seems ad hoc (see next todo)
- [ ] **Grid floor overlays → `QuantizedSpriteCache`** — belts today call `conveyorDraw` directly every frame; power sources use ad hoc canvas. Route both through `getOrBakePropSprite` / blit like WorldProps. Keep sim on `floorStore`.
- [ ] **D.3 chain draw** — after sprite pipeline or in parallel if not ad-hoc
- [ ] Tripwire → alarm / behavior wiring
- [ ] Belt `beltZoneEvents` → gameplay
- [ ] Crossing → target links (needs prop-extras JSON)
- [ ] `gridZoneMembership` unit tests
- [ ] Belt polyline stamp, corner autotile, smoke test
- [ ] Scene JSON **prop extras** (button links in export)
- [ ] Animated floor tiles on grid (`animatedFloorStore`)
      **Other:** diagonal/corner edges (actually very important); beam break by prop volume; scene JSON merge/autosave; runtime snapshot + replay; TileLab naming cleanup; `segmentGrid` audit; interaction layers bitmask.
      **Floor props:** button bumper 3D, moving pit kinematics, floor prop resize.
      **Perf debt:** scope `runPushablePhysics` / `forEachOfKind("worldProp")` scans; viewport-filter laser sights; face-level AABB cull.
      **Archive:** `Libraries/Radio/`, `Libraries/Inspect/`, `PersistentTriggers`, `panelGrid` motif.

---

## Milestone log

Newest first. User-visible capabilities only.

| When       | Milestone                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-13 | **Passage power network v1** — `floorStore` source cells; vertex flood arms connected lasers; button `gridCell` links; scene JSON v5 `powerSources[]`; no per-edge self-power. |
| 2026-06-XX | **Passage profiles + unified blocking** — solid / oneWay / tripwire on boundary; `boundaryBlocksStepFrom`; powered passage collision; inspector + JSON modes.                  |
| 2026-06-XX | **GridZoneMembership core** — entity-centric enter/on/exit for belt cells + tripwire edges; tripwire red-while-crossed.                                                        |
| 2026-06-XX | **Boundary occupancy API** — `setBoundary` / `reconcileBeltBoundaries`; sole writer for rail + passage; belt laterals derived.                                                 |
| 2026-06-XX | **Forcefields edge graph v1** — stamped passage edges, button power (later superseded by source flood), Walls tab, scene JSON v3+.                                             |
| 2026-06-XX | **Sandbox scene JSON** — layout export/import (props, walls, belts, forcefields, power sources); schema v2→v5 as fields added.                                                 |
| 2026-06-XX | **Animated surface flipbook library** — bake + draw hooks; editor consumer still open.                                                                                         |
| 2026-06-XX | **Pool rack spawn props** — replaced assembly cartridge; cue `inputGates` via `spawnGroupId`.                                                                                  |
| 2026-06-XX | **Viewport-scoped kinematics anim** — visible props only via `queryView`.                                                                                                      |
| 2026-06-XX | **Sandbox Props \| Walls editor** — grid stamp/pick for voxel + rail + forcefield.                                                                                             |
| 2026-06-XX | **Sandbox HPA move-to-cursor** — path overlay + locomotion arrival.                                                                                                            |
| 2026-05-XX | **Four-way cell edge grid** — `edgeStore`, railWall, nav/collision integration.                                                                                                |
| 2026-05-XX | **Floor occupancy belts** — `floorStore`, force, belt rail edges, scene JSON belts.                                                                                            |
| 2026-05-XX | **Entity registry + `queryView`** — spatial culling for draw.                                                                                                                  |
| 2026-05-XX | **Editor dependency injection** — sandbox UI off `engine.js` junk drawer.                                                                                                      |
| 2026-05-XX | **Shared UI in Libraries** — param fields, controls.                                                                                                                           |
