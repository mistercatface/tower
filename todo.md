# todo

## current: ui refactor

- [x] **Phase 1 — shared UI in Libraries** — `Libraries/UI/paramFields.js`, `Component`, `SelectControl`, `SliderControl`; fix Libraries→Apps imports.
- [ ] **Phase 2 — TileLab naming cleanup** — `EditorGameState`, `editor-shell.css`, drop `TILELAB_` prefixes, dead shell CSS/comments.
- [ ] **Phase 3 — dependency direction** — Phase 2 naming cleanup.

### Inverted / injected dependencies

- [x] **`Libraries/Combat` → `Apps/Editor/engine.js`** — targeting + interaction pairs cut; combat/Core import Libraries directly.
- [x] **`Render` / kinematics → `Apps/Editor/engine.js`** — `getWorldPropRecipes`, `createDefaultKinematicsPorts`, editor `sceneHooks` passed from `preview.js`.
- [x] **`speedControl` → `Apps/Editor/engine.js`** — playback handlers injected at `mountLabViewport`.
- [x] **`engine.js` → `sandboxController` export** — `state.sandbox.controller`; render hooks read controller from `getGameState()`.
- [x] **`worldPropStates` global registry** — modes frozen on `WorldProp` (`WORLD_PROP_MODES`); no engine/sandbox `Object.assign`.
- [x] **`mountSandboxToyUi` → `Apps/Editor/ui/`** — editor sandbox panel UI; no longer exported from `Libraries/Sandbox`.
- [x] **`installEngineGlobals` / `editorEngineProfile`** — `installEditorDefaults(state)` in `Core/engineGlobals.js`; editor constants in one place.
- [x] **Drop `export const engine` junk drawer** — boot uses `installEditorDefaults(state)` only; no render/targeting/interaction on app object.
- [x] **`Index.html` generic shell** — radio overlay mounted from `installRadioOverlay` at app boot; thin `#gameWrapper` chassis only.

### Phase 3 — still open (priority)

1. **Phase 2 naming** — `EditorGameState`, `editor-shell.css`, drop `TILELAB_` prefixes, dead shell CSS.

## floor occupancy belts

Grid-stamped cell belts on `obstacleGrid.floorStore` (not `edgeStore`, not WorldProps). Draw via `conveyorDraw.js`; force via `applyPushableAccelerationAlongAngle` before pushable physics.

- [x] **Elbow belts** — `floor_belt_elbow_left` / `floor_belt_elbow_right` spawn stamps grid cells.
- [x] **Railed belts** — `floor_belt_rails` (+ elbow rails); amber rail draw; `beltRail` edges block lateral escape.
- [ ] **Polyline placement** — drag on grid; cardinal steps; chain stamp into `floorStore`.
- [ ] **Belt facing** — spawn-with-facing, rotate selected cell(s), inspector force default.
- [ ] **Corner autotile** — 4-bit junction detection on straight belt chains (optional polish).
- [ ] **Smoke test** — L-shaped path; ball rides through straight + elbow cells.
- [ ] **Persist belts** — save/load / map bake if belts should survive refresh outside sandbox.

**Deferred:** `EDGE_KIND.Conveyor` on `edgeStore` (boundary strips, directional crossing).

---

## Next — priority

### P1 — Ship gate

- [ ] **Acceptance checklist** — formal pass below.
- [ ] **Verify live profile edit** — sides and caps update on profile change.

### P2 — Editor / tooling

- [ ] **Editor labels** — “Solid fill” / “Edge line” → voxelBlock / railWall (optional with code rename).
- [ ] **Height edit for railWall** — extend `setStaticWallHeightInBounds` or edge-mode slider for `edgeStore`.
- [ ] **Map overview** — railWalls invisible in `bakeObstacleOverviewCache`; tint/overlay if needed.

### P3 — Polish / perf

- [ ] **Cap alignment regression** — radial camera pan (deferred).
- [ ] **Face-level AABB cull** — render perf backlog.

---

## Acceptance (hard gate)

- [ ] Fill voxel unchanged (height, chunk roof, damage, nav, collision).
- [ ] railWall: sides + ends show thickness; cap meets side tops in projection.
- [ ] Interior walkable through railWall-only cells (`canStep` + collision).
- [ ] Thickness 2 vs 4: visible width changes.
- [ ] 8×1 line: continuous after collinear merge (chunk boundaries blocked).
- [ ] Profile edit: side and cap motifs update.
- [ ] No parallel collision pass / teleport nudging.

---

## Migration / scope

- [ ] Grid-snapped content — audit remaining Segment stamp paths.
- [ ] **`segmentGrid`** — arbitrary-angle walls until baked.

---

## Backlog

### Edge API (before second edge kind)

- [ ] **`gridCellEdge(grid, col, row, side)`** — any kind from store; replace scattered `edgeStore.get` + kind checks.
- [ ] **`WorldObstacleGrid.getCellEdge` / `hasCellEdge`** — thin wrappers so editor/gameplay rarely touch `edgeStore` directly.
- [ ] **`forEachCellEdgeInAabb`** — kind-agnostic AABB walker (surface `edgeStore.forEachInAabb` via `wallGridCells`).
- [ ] **`edgeBlocksStepFrom(fromCol, fromRow, toCol, toRow)`** — directional crossing for one-way doors / edge conveyors.
- [ ] **Kind-aware `collectStructureZLevels`** — merge per-kind top-Z collectors when a second kind contributes surface passes.

### Floor props

- [ ] **`button_bumper` 3D**
- [ ] **`poweredLinkId` on strategy**
- [ ] **Moving pit kinematics**
- [ ] **Floor prop resize from UI**

### Bounds / Box4 (deferred)

- [ ] **`Box4f` / `Box4i` math layer**
- [ ] **Redo `GridCellRect` as min/max**
- [ ] **Frame converters**
- [ ] **Migrate `Aabb2D` object API**
- [ ] **`boundsToCellRect(aabb)`**

### Entity registry

- [ ] **Hardening: sync pickups on state load**
- [ ] **Reduce dual array/registry scans**

### WorldProp / state shape

- [ ] **Combat as one owned object**
- [ ] **Type-specific state structs**
- [ ] **Locomotion agent boundary**

### Refactors

- [ ] **`voxelBlock` / `railWall` code rename** — one PR, no alias passthroughs.
- [ ] **Naming clarity (optional)** — editor labels, grep cleanup, proxy fields.
- [ ] **`drawKinematicsFrameToCanvas` bundle**
- [ ] **`NavigationContext`**
- [ ] **`getStaticRoofDrawCanvas` / mask bake**

### Render / bake perf

- [ ] **`blitWallFaceSubdiv` row/col band tables**
- [ ] **Face-level AABB cull**
- [ ] **`composeSurfaceImage` per-motif passes**
- [ ] **Batch static cell damage alpha**

### Vector overlay (later)

- [ ] Per-asset vector colors; skip kinematics in vector-only mode.

### Smell

### Archive / never-wired

- [ ] **`Libraries/Radio/`**, **`Libraries/Inspect/`**, **`PersistentTriggers`**, **`createDebouncedStorage`**
- [ ] **`panelGrid` motif**

### Longer term

- [ ] **Interaction layers** — `drawLayer` + `collisionLayers` bitmask.
- [ ] **Grid wall extras** — corner posts, doors, one-way edges, autotile trim.
