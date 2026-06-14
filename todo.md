# todo

---

## CURRENT TASK: PORTALS

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
| 2026-06-14 | **Portals v1**                                                                                                                                                                 |
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
