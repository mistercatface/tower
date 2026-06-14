## CURRENT TASK: BELT MAZES

## BACKLOG

## Milestone log

Newest first. User-visible capabilities only.

| When       | Milestone                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-06-14 | **Quantized sprite caching for all current props** - rules in place to keep future props hooked to proper pipeline.                                                            |
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
