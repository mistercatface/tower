# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

One lattice for grid-snapped wall geometry. **One canonical face struct → draw, collision, nav.** No prop sync, no second collision pass, no separate proxy math.

- **`fill[idx]`** — `grid[]`: 0 = open, 1+ = static cell height (voxel block).
- **`edge[idx]`** — N/E/S/W height on cell boundary; open interior + edge = rail.

### Phase 1 — Canonical geometry (single source of truth)

- [x] **`edge[]` on `WorldObstacleGrid`** — parallel to `grid[]`; migrate on expand; bump `wallGridRevision`.
- [x] **`writeCellEdge` / `stampCellEdge` / clear** — height level + thickness; neighbor sync.
- [x] **`resolveGridWallFace` + `gridWallEdgeEndpoints`** in `wallGridCells.js` — one struct for draw + collision.
- [x] **`collectGridWallFacesInAabb`** — fill faces + edge rails (deduped per physical edge).
- [x] **`gridWallFaceToCollisionSegment`** — collision built from same face as draw.

### Phase 2 — Draw + surfaces

- [x] **Face collector** uses `collectGridWallFacesInAabb` only (no duplicate math in `StaticGridWallDraw`).
- [x] **Edge rails: no chunk roof bake** — cap comes from wall face band only (fill voxels keep chunk roofs).
- [x] **Fill roofs unchanged** — full cell mask at cap Z.
- [ ] **Optional:** collinear merge for long straight rails (perf).

### Phase 3 — Collision

- [x] **Edge rails:** `resolveGridWallFace` → `gridWallFaceToCollisionSegment` (same geometry as draw).
- [x] **Fill voxels:** cell-center proxy unchanged (works today).
- [x] **Same `resolveWalls` path** — no parallel pass, no teleport nudging.
- [ ] **Fill voxels:** optional upgrade to face segments later (not blocking).

### Phase 4 — Nav

- [x] **Cell blocked** — `fill > 0`.
- [x] **Edge crossing** — `canStep` on shared edge height.
- [x] **HPA / flow field** — consume `canStep`.

### Phase 5 — Editor (gated on acceptance)

- [x] **Stamp mode:** Solid fill vs Edge line (side + thickness) on wall tool panel.
- [x] **Delete** clears fill + edges in bounds.
- [ ] **Run acceptance matrix** before calling edge rails done (see below).

### Performance

- [x] Geom cache invalidates on `wallGridRevision` (fill + edge).
- [ ] Face-level AABB cull (backlog — render perf section).

### Acceptance (must pass before closing this task)

- [ ] Fill voxel: unchanged — height, roof, damage, nav block, collision from all angles.
- [ ] Edge rail on open floor: one wall face, **no full-cell roof**, interior walkable.
- [ ] Ball bounces off **visible face line**, not cell center.
- [ ] Thickness 2 vs 4: visual inset + contact both change together.
- [ ] 8×1 edge line: continuous wall, no gaps, no double caps.
- [ ] No manual `entity.x/y +=`; no parallel collision pass.

### Migration / scope

- [ ] **Grid-snapped content** — fill + edge only; no Segment entities for map rails.
- [ ] **`segmentGrid`** — secondary layer for arbitrary-angle walls until baked.
- [ ] **Conveyors** — floor props only; no edge data on belt assets.

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
- [ ] **`getStaticRoofDrawCanvas` / mask bake**

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
