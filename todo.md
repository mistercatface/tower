# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

Extend the existing obstacle grid so **one lattice** owns all grid-snapped wall geometry:

- **`fill[idx]`** — interior voxel height (today’s `grid[]`: 0 = open, 1+ = static cell height).
- **`edge[idx]`** — per-side wall height on N/E/S/W (0 = none). Open cell interior + wall on one edge = rail.

Same revision/stamp lifecycle as static walls. Same draw stack (`drawProjectedWallFace`, procedural band, cap/roof). **Not** prop-driven edge resolver, **not** Segment sync for grid-snapped content.

### Model

- [ ] **`edge[]` on `WorldObstacleGrid`** — parallel to `grid[]`; migrate on expand/rebuild; bump `wallGridRevision`.
- [ ] **`stampCellFill` / `stampCellEdge` / clear** — mirror `stampStaticWalls`; height level per stamp (same level scale as fill voxels).
- [ ] **Optional `edgeThickness`** — per-edge or per-stamp thickness (world px); used by draw + collision (see below).
- [ ] **Shared edge geometry** — extract `cellEdgeEndpoints(col, row, edge)` from static wall draw; one source for draw, debug, collision.

### Draw + surfaces (reuse static wall pipeline)

- [ ] **Unified face collector** — fill-derived faces (today) + explicit edge faces (new) → same drawable `{ p1, p2, wallHeight, wallCapHeight, … }`.
- [ ] **`drawProjectedWallFace`** — no second renderer; optional face kind `fill | edge` for roof/cap rules.
- [ ] **Roof masks** — fill → full cell rect at cap Z; edge-only → thin strip along edge at cap Z.
- [ ] **Thickness in draw** — visual depth/inset from `edgeThickness` (cosmetic extrusion depth, not a second occupancy grid).

### Collision (face-based, not cell-center proxy)

- [ ] **Face query** — nearby cells → enumerate active faces (fill + edge); thin contact on `p1–p2`.
- [ ] **Thickness in physics** — collision plane/segment offset **inward** by half thickness from grid line; span still `cellSize` along edge (or shortened for corners). Exact for the chosen primitive — plane/box matches stored thickness.
- [ ] **Wire into `resolveWalls`** — same impulse path as segments; remove reliance on fat cell-center proxy for edge-only walls.

### Nav + pathfinding

- [ ] **Cell blocked** — `fill > 0` (unchanged).
- [ ] **Edge crossing** — cardinal step A→B blocked if shared edge has height on either side.
- [ ] **HPA / flow field** — consume edge crossing; still one `WorldObstacleGrid` revision.

### Editor

- [ ] **Edge/rail stamp tool** — pick cell + side (or drag polyline of edges); writes `edge[]`.
- [ ] **Fill stamp tool** — existing static wall stamp → writes `fill[]` (rename/clarify only if needed).
- [ ] **Thickness control** — tool or inspector param on stamp (e.g. 1–4 px); stored on edge stamp.

### Migration / scope

- [ ] **Grid-snapped new content** — fill + edge only; no new Segment entities for map rails/voxels.
- [ ] **`segmentGrid`** — keep for arbitrary-angle Segment walls until baked; document as secondary layer.
- [ ] **Conveyors** — stay floor props (`pullAlongFacing`); do **not** hang edge data off belt assets.

### Acceptance

- [ ] Fill voxel: behaves like today’s static wall (height, roof, damage, nav block).
- [ ] Edge rail: open cell, one procedural face, thin cap, ball bounces off edge not cell center.
- [ ] Thickness 2 vs 4 px: visible difference + collision inset matches.
- [ ] No manual `entity.x/y +=` edge resolver; no parallel collision pass.

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
- [ ] **Grid wall extras** (see design notes): corner posts, half-height edges, doors, one-way edges, per-edge damage, autotile trim from edge adjacency.
