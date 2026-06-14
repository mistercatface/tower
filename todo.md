# todo

---

## CURRENT TASK: PORTALS

Revised parts (forward plan)
Part 2a — Portal power & link eligibility (new end-game gate)
Goal: A portal only works when it’s on the same laser power subgraph as its partner; linking is only offered between co-networked portals.

Work:

Extend passagePowerNetwork flood

Portals participate as conductors on the same vertex graph as lasers (exact rule: portal edge connects its two corner vertices when present; powered when flood reaches it — same as lasers today).
Set edge.powered on portal edges from flood result (reuse setPassagePowered / sync pass).
Network component index

After flood, tag each powered portal with a network id (connected component of powered passage edges + portal edges).
canLinkPortals(a, b) := both powered and same network id.
Editor

listPortalLinkTargets: only portals on the same network as selection (empty if selected portal unpowered).
Inspector: “On network” / “Off network — connect to a laser chain from a power source.”
Optional: dim unpowered portals; powered-but-unlinked vs powered-and-linked.
Pair integrity

On power network change: if partners land on different components, auto-unlink or mark link invalid (pick one policy — auto-unlink is simpler).
Re-run on syncPassagePowerNetwork (already called on wall/power edits).
Draw

Unpowered: grey/muted, no link UI.
Powered, unlinked: “on network, needs partner.”
Powered + linked: current shared/one-way viz.
Schema: optional linkMode / linkSourceKey unchanged; no bump required for power-only if runtime-derived. Document that partners must share a network at edit time.

Part 2b — Access sides (one vs both) (new)
Goal: Per portal edge, choose whether one adjacent cell or both adjacent cells can step onto the portal. The blocked side behaves like solid wall when the portal is powered (belt-like: entry only from allowed side).

Work:

Data — add something like accessMode: "both" | "one" (+ keep or replace allowedSide / owner cell semantics).

Both: either cell across the edge can initiate portal entry (when powered + linked).
One: only the owner cell (or explicitly chosen side) can; crossing from the neighbor cell hits boundaryBlocksStep as solid.
Physics hook (stub now, real in Part 3)

portalBlocksStepFrom(grid, fromCol, fromRow, toCol, toRow, edge) — wrong-side entry blocked when powered.
Unpowered: treat as solid (or inert — decide; “must be on laser network” suggests inert/off when unpowered).
Editor

“Access: Both sides | One side only” (+ side picker if one).
Separate from Connection (shared vs one-way travel between pair).
Draw

One-side: small arrow on the edge showing allowed cell (reuse one-way forcefield arrow language).
Both: no entry arrow, or ⇆ on the edge itself.
Schema v7 when this lands (new field; bump version).

Note: Deprecate or repurpose Part 1 entranceMode on portals so we don’t have two overlapping “one-way” concepts. Likely: drop portal entranceMode in favor of accessMode, keep connection linkMode for travel direction.

Part 3 — Traverse FSM (was Part 2)
Goal: Step onto a valid portal → inside (0 ms v1) → exit at partner.

** Preconditions (end game):**

Portal powered (same laser network)
Portal linked to partner (partner also powered, same network)
Step from an allowed access side
Connection linkMode allows this direction (one-way: only from source portal)
Work: entity state portalInside / cooldown; physics hook on step; exit at partner midpoint/cell; no-op when any precondition fails.

Part 4 — Pathfinding (was Part 3)
Goal: canStep / nav treats powered+linked+same-network portal pairs as shortcuts (respect connection direction + access sides).

Work: portalNavIndex built from powered portal pairs in same component; wire into WorldObstacleGrid.canStep; HPA passes that still skip canStep / grid[] !== 1 fixes remain on the list.

Part 5 — Polish (was Part 4–5)
insideMs timer, non-instant exit
Power optional per-design (you’ve now made it required — update docs)
Scene export/import for access + validated links on load

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
