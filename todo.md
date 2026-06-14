## CURRENT TASK: BELT MAZES

## SIDE TASK: PIPELINE REFACTOR

PR 1 — Pipeline core (pure library, no UI)
Add Libraries/Pipeline/ with the shared data layer: objectPath.js (deepClone, getByPath, setByPath), fieldSchema.js (FieldDef shape, numeric clamping), stepRegistry.js (registerStep, getStep, listSteps, stepId normalizing op vs type), and validatePipeline.js (unknown step, missing fields, out-of-range numbers → { ok, errors[] }). No editor changes yet — this PR is import-only proof that Profile, Sandbox, and future Map can share one validation path without touching DOM.

PR 2 — Schema field renderer + ProfileEditor wiring
Extract renderScalarFields from ProfileEditor.js into Libraries/UI/renderSchemaFields.js, backed by the PR 1 path utils. ProfileEditor deletes its local deepClone / path helpers / renderScalarFields and imports from Pipeline + UI instead. Behavior and layout stay the same; this PR is a straight refactor that proves the field schema works against real MOTIF_TYPES metadata before any list or Gen work lands.

PR 3 — Generic pipeline list UI
Add Libraries/Pipeline/pipelineList.js (add/remove/reorder/select rows with stable editorIds) and Libraries/UI/pipelineListUi.js (the reorderable row list DOM). Refactor Profile’s renderMotifList to use the generic list with small hooks for Profile-only row chrome (enable toggle, blend select, surface mask label). CSS stays on existing .motif-row classes (optionally aliased as pipeline rows). After this PR, Gen gets a motif list for free — only hooks and registry differ.

PR 4 — Export, registry adapters, room-graph schema
Add exportPipeline.js (JSON + optional JS snippet) and wire Profile export through it. Add buildRegistryFromMotifTypes(MOTIF_TYPES) so procedural steps formally implement PipelineStepDef without rewriting motif files. Add Libraries/Sandbox/roomGraphStepRegistry.js for the ops you actually use today, plus validateRoomGraphMotifs / tryBuildSandboxRoomGraphSceneDoc calling PR 1 validation and a non-throwing try wrapper. No Gen tab yet — this PR completes the shared contract so the Gen sidebar is mostly wiring, not new architecture.

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
