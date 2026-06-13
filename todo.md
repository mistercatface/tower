# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

One lattice for grid-snapped wall geometry.

- **`fill[idx]`** — `grid[]`: 0 = open, 1+ = static cell height (voxel block).
- **`edge[idx]`** — N/E/S/W height on cell boundary; open interior + edge = thin rail box.

**Fill voxels** — existing face-line path (`computeProjectedFace` + chunk roof). Unchanged.

**Edge rails** — axis-aligned box (`GridEdgeRailBox`); draw via `projectWorldPointInto` (same projection as roofs/props). **Rejected:** face-line + `computeProjectedFace`, coplanar dual faces, chunk roof strip mask.

### Phase 1 — Data + collision (done)

- [x] **`edge[]` / `edgeThicknessGrid`** on `WorldObstacleGrid`; neighbor sync; `wallGridRevision`.
- [x] **`writeCellEdge` / stamp / clear** in editor.
- [x] **`gridWallEdgeRailShouldEmit`** — one physical rail per shared boundary.
- [x] **`gridWallEdgeRailToCollisionSegment`** — boundary-centered segment, full thickness.
- [x] **Nav `canStep`** on edge crossing.

### Phase 2 — Edge rail box draw (in progress)

- [x] **`resolveGridWallEdgeRailBox` + `collectGridEdgeRailBoxesInAabb`** — footprint + inner/outer face lines + cap height.
- [x] **`drawProjectedGridEdgeRail`** — `projectWorldPointInto` for 2 side quads + top cap (no `computeProjectedFace`).
- [x] **`drawProjectedWallFaceElevated`** — fill faces can migrate later; rails use this for textured sides.
- [x] **Wire `WorldSceneRenderer`** — `staticGridEdgeRail` → box draw; fill stays on `drawProjectedWallFace`.
- [x] **Remove edge rails from chunk roof path** — no strip in `buildStaticRoofMaskCanvas` / `collectStaticRoofHeightsFromGrid`.
- [ ] **Debug wireframe toggle** (optional) — projected box corners before closing acceptance.
- [ ] **Optional:** collinear merge for long straight rails (perf).

### Phase 3 — Fill voxel draw (unchanged)

- [x] **`collectGridWallFacesInAabb`** — fill cells only.
- [x] **Chunk roof** — full cell mask at cap Z via `drawRoofs`.

### Phase 4 — Editor

- [x] Stamp mode: Solid fill vs Edge line (side + thickness).
- [x] Delete clears fill + edges.
- [ ] **Run acceptance matrix** (below) before calling edge rails done.

### Acceptance (hard gate)

- [ ] Fill voxel unchanged from all angles.
- [ ] Edge rail: **two visible side faces** when orbiting; **top cap aligned** with sides (same projection).
- [ ] Interior walkable; ball hits boundary segment.
- [ ] Thickness 2 vs 4 changes visible width + collision together.
- [ ] 8×1 line continuous, no gaps.
- [ ] No parallel collision pass / teleport nudging.

### Migration / scope

- [ ] Grid-snapped content — fill + edge only for map rails.
- [ ] **`segmentGrid`** — arbitrary-angle walls until baked.
- [ ] Conveyors — floor props only.

---

## Backlog

### Conveyor belts (Phase 2+)

- [ ] **Conveyor placement tool** — drag polyline on grid (props, not wall stamps).
- [ ] **Facing along path** — cardinal step from drag direction.
- [ ] **Conflict rules** — reject overlap with existing belt cell.
- [ ] **Chained spawn UX** — attach cells; ESC ends chain.
- [ ] **Corner draw variants (optional)** — miter art when perpendicular belt neighbors.
- [ ] **Smoke test** — L-shaped path + ball on entry.

### Floor props

- [ ] **`button_bumper` 3D**
- [ ] **`poweredLinkId` on strategy**
- [ ] **Moving pit / conveyor kinematics**
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

- [ ] **`drawKinematicsFrameToCanvas` bundle**
- [ ] **`NavigationContext`**
- [ ] **Migrate fill voxels to `drawProjectedWallFaceElevated`** (unify projection with rails/roofs)

### Render / bake perf

- [ ] **Cache `computeWallFaceSubdiv` on drawable**
- [ ] **`blitWallFaceSubdiv` row/col band tables**
- [ ] **Face-level AABB cull**
- [ ] **`composeSurfaceImage` per-motif passes**
- [ ] **Read `getTexelResolution` once per draw pass**
- [ ] **Batch static cell damage alpha**

### Vector overlay (later)

- [ ] Per-asset vector colors; skip kinematics in vector-only mode.

### Smell

- [ ] **`createDefaultRenderPorts` in `engine.js`**

### Archive / never-wired

- [ ] **`Libraries/Radio/`**, **`Libraries/Inspect/`**, **`PersistentTriggers`**, **`createDebouncedStorage`**
- [ ] **`panelGrid` motif**

### Longer term

- [ ] **Interaction layers** — `drawLayer` + `collisionLayers` bitmask.
- [ ] **Grid wall extras**: corner posts, half-height edges, doors, one-way edges, per-edge damage, autotile trim.
