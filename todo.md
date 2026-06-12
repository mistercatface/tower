# todo

## Current — conveyor belts

Floor props fixed to the obstacle grid, one cell per segment. Low box sprite (crate-like, short height) with a direction arrow on the top face. Push occupants in the arrow direction while they overlap the cell — same occupancy + force pattern as `gravity_pad`, but **one cell wide**, **cardinal facing only**, and **chain-placed** so segments snap together when you paint them.

**Corners:** no separate elbow prop or L-shaped physics. A 90° turn is just two (or more) grid cells with different facings; force is always “along this cell’s arrow.” Elbow look is **draw-only** (corner sprite / join art) — optional polish, not a blocker.

### Prerequisites

- [x] **Grid-anchored sandbox placement** — `anchorFloorPropToObstacleGrid`, spawn + inspector snap via `state.obstacleGrid` + `snapWorldToObstacleCellCenter` (`GridCoords.js`).
- [x] **One prop = one grid cell** — footprint = `cellSize × cellSize`; `gridCol` / `gridRow` on prop; conflict check via `findGridAnchoredFloorPropAtCell`.
- [x] **Cardinal facing only** — `quantizeSteps: { facing: 4 }`, `cardinalFacing` strategy flag, `rotateCardinalFloorProp` / inspector 90° rotate.
- [x] **Directional pull from facing** — `pullAlongFacing` floor effect in `floorEffects.js` using `cardinalUnitVectorFromAngle`.
- [x] **Per-cell occupancy** — one cell rect per segment via `processFloorShapes` + `syncFloorPropCollisionShape`.

### Phase 1 — belt segment (`conveyor`)

- [x] **Asset** — `conveyor` floor trigger prop; `gridAnchored`, `cardinalFacing`, cell halfExtents.
- [x] **Draw** — `createConveyorDraw()`; cache key includes cardinal facing (4 variants via `quantizeSteps`).
- [x] **Physics** — `floorTriggers: [{ when: "occupied", effect: "pullAlongFacing", force: … }]`.
- [x] **Spawn** — sandbox menu entry; single-click places one snapped cell with current facing.

### Phase 1.5 — cell edge barriers (physical rails)

Grid-snapped props declare **which cell perimeter edges are solid** via a 4-bit local mask (`cellEdgeBarrier` on strategy). Collision is **exact grid cell edge planes** in the physics pass — not `Segment` walls, nothing to sync on spawn/rotate.

- [x] **`gridCellEdges.js`** — `CELL_EDGE_*` mask, `getGridCellBoundsForProp`, hard edge-plane resolve.
- [x] **`gridCellEdgeBarriers.js`** — `resolveEntityCellEdgeBarriers` in collision pipeline only.
- [x] **Straight conveyor** — `cellEdgeBarrier: CELL_EDGE_LATERAL` on `conveyor.asset.js`; ball enters from rear, bounces off side rails.
- [x] **Elbow conveyors** — named asymmetric masks per asset (`conveyor_elbow_left` / `_right`); local mask rotates with `facing`, no per-frame vector lists.
- [ ] **Smoke test** — roll ball into straight segment from entrance vs sideways; rotate belt and confirm barriers follow; elbow wedge-in blocked on outer arc.

### Phase 2 — chain placement (paint mode)

- [ ] **Conveyor placement tool** — with belt selected, pointer drag on grid paints a polyline of cells (like static wall stamp, but props not walls).
- [ ] **Facing along the path** — each new cell gets facing from drag direction (cardinal step); 90° bends are just the next cell’s facing — same prop type throughout.
- [ ] **Conflict rules** — reject overlap with existing belt cell; optional replace-on-paint. Breaking a chain deletes or orphans segments consistently.
- [ ] **Chained spawn UX** — each new cell attaches to the previous; ESC / tool change ends chain; backspace removes last segment optional.

### Phase 3 — polish

- [ ] **Inspector** — force slider; rotate 90°; read-only grid coords. *(partial — done for `conveyor`; generalize if more grid props appear)*
- [ ] **Corner draw variants (optional)** — mitered/corner top-face art when a cell has a perpendicular belt neighbor; cosmetic only, no new collision or effect.
- [ ] **Smoke test** — L-shaped path of cells + ball dropped on entry.

---

## Backlog

### Floor props

- [ ] **`button_bumper` 3D** — impact-activated button; same `buttonLinks`; not `spatialRole: "trigger"`.
- [ ] **`poweredLinkId` on strategy** — optional: gravity pad declares its button source on the pad row (today: button `targets` only; pinball works without this).
- [ ] **Moving pit / conveyor kinematics** — floor prop that moves per tick (related long-term; belts are fixed cells for now).
- [ ] **Floor prop resize from UI** — arbitrary rect beyond spawn params.

### Bounds / Box4 (deferred)

- [ ] **`Box4f` / `Box4i` math layer** — shared min/max interval ops for world + grid boxes.
- [ ] **Redo `GridCellRect` as min/max** — unify with `Aabb2D` algebra.
- [ ] **Frame converters** — `gridBoxToWorldAabbInto`, `worldAabbToGridBoxInto`.
- [ ] **Migrate `Aabb2D` object API** — optional thin view over `Box4f`.
- [ ] **`boundsToCellRect(aabb)`** — accept `Aabb2D` at grid floor.

### Entity registry

- [ ] **Hardening: sync pickups on state load** — registry membership + spatial tags when restoring sim state.
- [ ] **Reduce dual array/registry scans** — `pushablePhysicsPass`, assembly cleanup via `forEachOfKind` where order allows.

### WorldProp / state shape

- [ ] **Combat as one owned object** — `weaponLoadout`, turrets, etc. under `prop.combat`.
- [ ] **Type-specific state structs** — flipper, stand tip, rolling state in per-kind bags.
- [ ] **Locomotion agent boundary** — explicit locomotion component instead of field graft on every prop.

### Refactors

- [ ] **`drawKinematicsFrameToCanvas` bundle** — sprite bake scratch + rig + viewContext.
- [ ] **`NavigationContext`** — dedupe 11-arg nav infra in `planHpaSteering` / `replanPath`.
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — fold mask coords into `ChunkDrawPass`.

### Render / bake perf

- [ ] **Cache `computeWallFaceSubdiv` on drawable** — keyed by quantized viewer position.
- [ ] **`blitWallFaceSubdiv` row/col band tables** — precompute subdiv bands once.
- [ ] **Face-level AABB cull before per-quad cull**.
- [ ] **`composeSurfaceImage` per-motif full-pixel passes** — offline motif bake or tile-based processing for heavy profiles.
- [ ] **Read `getTexelResolution(settings)` once per draw pass** in `WorldSurfaceEngine`.
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** when many damaged cells visible.

### Vector overlay (later)

- [ ] Per-asset vector colors; skip kinematics tick in vector-only mode; projectile vector shapes.

### Smell

- [ ] **`createDefaultRenderPorts({ weaponVisuals: … })` in `engine.js`** — belongs elsewhere?

### Archive under `Libraries/Deprecated/` (gitignored)

Already archived: `sharedEdges/`, `sceneCompiler/`, `canvasInput/`.

Removed (too trivial to archive): `spawnStartProps.js`.

#### Never-wired subsystems

- [ ] **`Libraries/Radio/`** — `createRadioSystem` never called; strip vestigial hooks after move.
- [ ] **`Libraries/Inspect/`** — 3D inspect viewer; zero external imports.
- [ ] **`Libraries/Triggers/PersistentTriggers.js`** (+ `Triggers/index.js` if empty).
- [ ] **`Libraries/Persistence/createDebouncedStorage.js`** (+ `Persistence/index.js` if empty).

#### Still registered but legacy

- [ ] **`panelGrid` motif** — remove from `MotifRegistry` or archive under `Deprecated/`.

### Longer term

- [ ] **Interaction layers** — `drawLayer` + bitmask `collisionLayers` instead of scattered flags (`renderMode`, `spatialRole`, separate floor tick passes).
