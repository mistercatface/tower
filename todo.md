# todo

## Current priorities

### Remove assembly cartridge system (gate before sandbox save) — done 2026-06

Pinball / pool **table assemblies** removed. Pool play is two spawn props: **8-ball triangle** and **9-ball triangle** (`spawnPoolRack.js`). Cue **`inputGates` + `cueStrike`** unchanged (waits for grouped balls at rest via `spawnGroupId`).

- [x] Delete assembly stack (`assemblies/`, `spawnAssembly.js`, surface bake/draw/layout, manifests)
- [x] **`spawnPoolRack`** + **`pool_rack_8ball` / `pool_rack_9ball`** spawn props
- [x] **`spawnGroupId`** on meta + `inputGates` link (replaces assembly group)
- [x] **`cueStrikeBehavior`** — obstacle-grid aim bounds only
- [x] Scene list / box select — all props first-class (no assembly membership filter)
- [x] **`sandboxWalls.js`** — segment wall helpers kept for fixture walls / map tools

**Then:** proceed with **Sandbox scene JSON export/import**.

### UI / architecture

- [ ] **Phase 2 — TileLab naming cleanup** — `EditorGameState`, `editor-shell.css`, drop `TILELAB_` prefixes, dead shell CSS/comments.
- [ ] **Phase 3 — dependency direction** — finish after Phase 2 naming.

### Floor occupancy belts

Grid-stamped cell belts on `obstacleGrid.floorStore` (not `edgeStore`, not WorldProps). Draw via `conveyorDraw.js`; force via `applyPushableAccelerationAlongAngle` before pushable physics.

- [ ] **Polyline placement** — drag on grid; cardinal steps; chain stamp into `floorStore`.
- [ ] **Belt facing** — spawn-with-facing, rotate selected cell(s), inspector force default.
- [ ] **Corner autotile** — 4-bit junction detection on straight belt chains (optional polish).
- [ ] **Smoke test** — L-shaped path; ball rides through straight + elbow cells.
- [ ] **Persist belts** — save/load / map bake if belts should survive refresh outside sandbox → see **Sandbox scene JSON export/import**.

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

### Diagonal / corner cell edges (deferred)

Cardinal `edgeStore` (4 sides × mirrored boundary) stays the default. Add corner/diagonal topology only when a feature cannot be expressed as two cardinal edges or a derived corner query.

**Prerequisite:** ship directional cardinal crossing (`edgeBlocksStepFrom`) + at least one second edge kind (e.g. `EDGE_KIND.Conveyor`) so corner ownership rules are clear before expanding storage.

- [ ] **Spike — corner ownership model** — pick one: `(cols+1)×(rows+1)` corner store (4 cells share a slot) vs derived corner index from 4 adjacent cardinal edges; document mirror/write rules (corners have no single “owner” cell).
- [ ] **Corner index API** — `gridCellCorner(col, row, corner)` where corner ∈ {NE, SE, SW, NW} or vertex at `(col, row)` grid intersection; neighbor lookup for the up-to-four cells meeting at a point.
- [ ] **Derived corner queries first** — helpers like `cornerBlocksDiagonalStep(fromCol, fromRow, toCol, toRow)` composed from existing cardinal `edgeBlocksStep` + fill occupancy before any new store (validate against current `canStep` corner-cutting).
- [ ] **Corner-mounted kinds (when store wins)** — corner posts, wire/pipe junctions, diagonal rail anchors; single stamp at a 4-cell intersection instead of duplicating on two sides.
- [ ] **True diagonal segments** — 45° boundary rails/pipes across a cell interior (not representable as one N/E/S/W edge); separate from “diagonal step” pathfinding (already two cardinal edges).
- [ ] **Editor + persist** — stamp/pick corner slots; save/load / map bake parity with `edgeStore` remap on grid resize.
- [ ] **Consumers audit** — list what actually needs corners vs cardinal-only: pathfinding (likely derived), collision emit, structure Z-levels, render overlay.

**Not in scope unless proven necessary:** 8 stored directions per cell (duplicates cardinal mirroring); diagonal adjacency as a third parallel graph alongside sides.

### Sandbox scene JSON export/import

**Distance:** ~**70% of the read path exists**, ~**0% of the write path**. Enumeration + stamp APIs are in place; no snapshot schema, apply/load, or UI yet. A minimal **copy/paste MVP** (props + voxel walls + rail walls + floor belts) is roughly **one focused pass** (~half day). Full sandbox fidelity (behaviors, button wiring, assemblies) is a second pass.

**Already have (export side):**
- `listPlacedVoxelWalls` / `listPlacedRailWalls` / `listPlacedFloorBelts` — grid cell data from `sandboxSession`
- `stampVoxelWallAt`, `stampRailWallAt`, `writeFloorCell`, `spawnAt` — symmetric apply paths
- `createDebouncedStorage` — generic JSON flush/read (unused; wire after paste-load works)
- Profile editor pattern — textarea + copy (`ProfileEditor.js` export area)

**Gaps:**
- [ ] **`collectSandboxSceneSnapshot(state)`** — single `{ schemaVersion, cellSize, origin: { minX, minY }, props, voxels, railWalls, floorBelts }`; props need **world `x/y/facing/faction`** (today `listPlacedProps` is UI-only: id/type/label, no position)
- [ ] **Rail wall dedupe on export** — `listPlacedRailWalls` scans every cell×side; mirrored edges appear twice; emit once per boundary (`packEdgeCellKey` / canonical owner side)
- [ ] **Coordinate frame** — include `obstacleGrid.minX/minY` (grid expands dynamically); props as world coords; walls/belts as **global** col/row (`gridCellToGlobalColRow`) so paste survives origin shift
- [ ] **`applySandboxSceneSnapshot(state, doc, { mode: 'replace' | 'merge' })`** — clear sandbox props/walls/belts (reuse `session.clear()` + voxel/rail clear helpers), expand grid to bounds, re-stamp in stable order (voxels before rail caps), `notifyGridWallChange` / nav invalidate once at end
- [ ] **Prop extras (v1.1)** — faction, `SandboxEntityMeta` behavior overrides; skip runtime state (velocity, health, dead, sleeping)
- [ ] **Button links (v1.2)** — export stable refs (prop index or `type@ordinal`), remap `buttonLinks` after spawn (runtime entity ids are not portable)
- [ ] **UI — Sandbox panel** — Export (textarea + Copy), Import (textarea + Load / Replace confirm); validate JSON + schema version with readable errors
- [ ] **Optional autosave** — `createDebouncedStorage` on sandbox session dirty hooks (after MVP paste-load)

**Explicit v2 / out of MVP:**
- Assembly instances — removed; pool racks are spawn props, not saved assemblies
- `state.walls` segment grid / arbitrary-angle walls
- Cavern/play-area editor config (generation bounds, not stamped content)
- `surfaceProfileZones`, assembly guides

**Suggested schema sketch (v1):**

```json
{
  "schemaVersion": 1,
  "cellSize": 16,
  "origin": { "minX": 0, "minY": 0 },
  "props": [{ "type": "crate", "x": 128, "y": 256, "facing": 0, "faction": "neutral" }],
  "voxels": [{ "col": 8, "row": 16, "heightLevel": 4 }],
  "railWalls": [{ "col": 8, "row": 16, "side": 1, "heightLevel": 4, "thicknessLevel": 2 }],
  "floorBelts": [{ "col": 10, "row": 16, "kind": 1, "facingIndex": 0 }]
}
```

Use global `col`/`row` for grid-stamped layers; world `x`/`y` for free-placed props.

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

### Archive / never-wired

- [ ] **`Libraries/Radio/`**, **`Libraries/Inspect/`**, **`PersistentTriggers`**, **`createDebouncedStorage`**
- [ ] **`panelGrid` motif**

### Longer term

- [ ] **Interaction layers** — `drawLayer` + `collisionLayers` bitmask.
- [ ] **Grid wall extras** — doors, one-way edges, autotile trim; corner posts → see **Diagonal / corner cell edges**.

---

## Every-frame pipeline debt

Work that still runs globally (or scans the full prop list) when `EntityRegistry.queryView`, `SpatialFrame`, pushable sleep, or viewport visibility could scope it. Scaling is mostly getting these into the right pipelines.

**Pattern to prefer:** sim-wide only for things that must stay correct off-screen (physics, nav, persistence); presentation and expensive queries via `queryView` / `boundsVisibleWide` / active sets.

- [x] **Kinematics rig anim** — moved to `tickVisibleKinematicsAnim` + `queryView` (visible kinematics props only).
- [ ] **`runPushablePhysics`** — `state.worldProps` × motion substeps every frame; no active/sleeping/wide-bounds partition yet.
- [ ] **`WorldProp.update` kinematics facing / turret sync** — still runs for every kinematics prop in the physics loop (including off-screen).
- [ ] **`forEachOfKind("worldProp")` full scans** — used in combat, sandbox floor/button/effect passes, targeting, explosions, laser cast, drag launch, flippers, stand tips, auto-combat, etc.; most could be `queryView` or spatial-neighbor scoped.
- [ ] **`drawFloorProps`** — `forEachOfKind` + manual AABB test instead of `queryView` (3D/kinematics draw already uses `queryView`).
- [ ] **`drawSandboxLaserSights`** — all armed props, not viewport-filtered.
- [ ] **Dual iteration** — many systems walk `state.worldProps` directly *and* registry; consolidate on registry + spatial queries.
- [ ] **Navigation HPA clearance replans** — partially viewport-gated (`NavigationService`); extend the same visibility/active policy to sandbox HPA if paths get heavy.
- [ ] **Behavior / overlay ticks** — sandbox controller ticks selected prop only (fine); audit other per-frame editor overlays for global work.

---

## Milestone log

Major feature completions only (newest first). Not bugfixes or polish unless they shipped a user-visible capability.

| When | Milestone |
|------|-----------|
| 2026-06 | **Pool rack spawn props** — removed assembly cartridge system; `pool_rack_8ball` / `pool_rack_9ball` + `spawnPoolRack`; cue `inputGates` via `spawnGroupId`. |
| 2026-06 | **Viewport-scoped kinematics anim** — idle/walk rig ticks only for visible props via `queryView`; physics stays global. |
| 2026-06 | **Sandbox Props \| Walls editor** — grid stamp/pick/edit for voxelBlock + railWall; session + pointer routing. |
| 2026-06 | **Sandbox HPA move-to-cursor** — cell-center targets, path overlay trim, locomotion arrival release. |
| 2026-05 | **Four-way cell edge grid** — `CellEdgeStore` + mirrored railWall on `edgeStore`; thickness, caps, nav/collision integration. |
| 2026-05 | **Floor occupancy belts** — `floorStore` cell belts (straight, elbow, railed); force before pushable physics; belt rail edges. |
| 2026-05 | **Entity registry + `queryView`** — cached bounds queries over spatial broadphase; adopted for 3D/kinematics draw culling. |
| 2026-05 | **Editor dependency injection** — combat/render/playback/sandbox UI decoupled from `engine.js` junk drawer; `installEditorDefaults`, controller on state. |
| 2026-05 | **Shared UI in Libraries** — param fields, slider/select controls; Phase 1 UI refactor. |
