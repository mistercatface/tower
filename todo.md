## CURRENT TASK: BELT MAZES

## SIDE TASK: GEN

Phase 1 — Gen tab shell + safe generate (~1 PR)
Goal: Move graph generation out of JSON, use tryBuild, show errors instead of throwing.

Step What
1
shellHtml.js — Add Gen radio (value="gen"), new #genPanel section with hosts: #genTools, #genMotifList (empty for now), #genParams, #genStatus, #genExport.
2
viewMode.js — setEditorPanelVisible("genPanel", panel === "gen").
3
TileLabEditorState.js — sidebarPanel already a string; "gen" is fine, no schema change needed.
4
New Apps/Editor/ui/gen/GenEditor.js — Module-level editor state: { seed, motifs: deepClone(DEFAULT_SANDBOX_GRAPH_MOTIFS) }. Render: seed slider, Generate button, status line. On generate: validateRoomGraphMotifs(motifs) → if bad, list errors in #genStatus; else tryBuildSandboxRoomGraphSceneDoc({ seed, motifs }) → on success call controller apply + requestRedraw, on failure show reason.
5
createSandboxController.js — Add tryLoadGraphScene(options) returning { ok, reason? } (wraps tryBuild + applySandboxSceneSnapshot + session reset — same cleanup as loadRandomGraphScene today). Keep loadRandomGraphScene as thin { seed: Date.now() } caller or delete once Gen owns it.
6
editorUi.js — initGenEditor({ controller, onChange }) after sandbox mount (needs controller ref).
7
sandboxToyUi.js — Remove Generate random graph from renderSceneJsonPanel; JSON tab stays copy/paste only.
Phase 1 deliberately does not edit motifs in UI yet — it uses the cloned default pipeline. That proves the tab, validation, and non-throwing path.

Phase 2 — Motif pipeline editor (~1 PR)
Goal: Profile-like editing, driven by ROOM_GRAPH_STEP_REGISTRY + shared Pipeline/UI.

Step What
1
Row model — Gen rows: { id, enabled, config } via createPipelineRow(deepClone(def.defaults), id). Top-level array mirrors motifs (today: one retryUntil row).
2
Motif list — renderPipelineListUi + ROOM_GRAPH_STEP_REGISTRY.list() for labels. Add-step dropdown from registry (filter ops appropriate at top level — basically retryUntil or flat steps if you drop the wrapper later).
3
Params panel — Selected row → registry.get(stepId(row.config)) → renderSchemaFields(container, row.config, def.fields). Re-validate on change with validateRoomGraphMotifs(buildMotifsFromEditor()); disable Generate or show inline errors when invalid.
4
Nested slots — Hardest part. Start narrow: assume single top-level retryUntil, edit body[] as a sub-list (same list UI, different container). Slot steps (forEachNode.run, forEachEdge.run) as nested “Selected step → Run” panel using def.slots + allowedSteps. Defer full arbitrary-depth tree UI until this works.
5
Wire unused Pipeline helpers — removePipelineRowAt, findPipelineRowIndex, remapIndexAfterRemove if body reorder matters; validatePipelineRows is optional if you always export flat config[] through validateRoomGraphMotifs.
6
clampFieldValue in renderSchemaFields — Clamp on slider change so pasted/broken JSON can’t leave invalid ranges.
Generate always passes editor motifs, not DEFAULT_SANDBOX_GRAPH_MOTIFS, so edits actually affect output.

Phase 3 — Presets, export, feedback (~1 PR)
Step What
1
Presets — Dropdown: Default (shipped array), optional localStorage saves (genPreset:v1). Load = deepClone into editor state.
2
Export — #genExport textarea: exportPipelineJson(motifs) + Copy; optional exportPipelineJsModule(motifs, "SANDBOX_GRAPH_MOTIFS") for dropping into sandboxRoomGraphGen.js.
3
Post-build stats — After successful tryBuild, read doc.meta / layout summary (room count, corridor count, grid size) into #genStatus so you know why a seed worked.
4
JSON tab link — After generate, optional “View scene JSON” switches to JSON tab with exported snapshot (reuse controller.exportSceneSnapshot()).
File map (new vs touched)
Apps/Editor/ui/
shellHtml.js ← Gen tab + panel markup
viewMode.js ← panel visibility
editorUi.js ← initGenEditor
gen/GenEditor.js ← NEW (main logic)
sandboxToyUi.js ← remove graph button
Libraries/Sandbox/
createSandboxController.js ← tryLoadGraphScene
(reuse, no changes required for Phase 1)
roomGraphStepRegistry.js
sandboxRoomGraphGen.js (tryBuild, DEFAULT_SANDBOX_GRAPH_MOTIFS)
Libraries/UI/renderSchemaFields.js, pipelineListUi.js
Libraries/Pipeline/\*
Suggested order of implementation
Phase 1: tab + tryBuild generate
Phase 2: registry-driven motif editor
Phase 3: presets + export + stats
Do Phase 1 first — it’s mostly wiring and immediately improves UX (errors, discoverability). Phase 2 is where the refactor pays off; Phase 3 is polish.

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
