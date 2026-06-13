# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

One lattice for grid-snapped wall geometry.

**Canonical terms (locked):** **`voxelBlock`** vs **`railWall`**. Use these in chat, docs, and **new** code/comments. Never say “grid wall”, “fill”, or “edge rail” when you mean one of the two — always pick the term. **Not expected to change** unless a third static-grid geometry kind is added.

**Storage field names** (`grid[]`, `edgeGrid`, `edgeThicknessGrid`) stay as-is — implementation detail, not part of the vocabulary.

**Code rename** (symbols/files still say `GridWall`, `EdgeRail`, `staticGrid`, etc.) — deferred to **later refactor phase**; see Backlog → Refactors. No dual aliases when that lands.

|               | **voxelBlock**    | **railWall**                                   |
| ------------- | ----------------- | ---------------------------------------------- |
| **Occupancy** | Whole cell solid  | Thin strip on cell boundary; interior walkable |
| **Storage**   | `grid[idx]`       | `edgeGrid[idx*4+side]` + `edgeThicknessGrid`   |
| **Geometry**  | vertical face     | thin box                                       |
| **Collision** | cell-center proxy | boundary segment (inline; frozen)              |

- **`grid[idx]`** — voxelBlock height (0 = open, 1+ = static cell height).
- **`edgeGrid` + `edgeThicknessGrid`** — railWall on N/E/S/W boundary.

### Two render pipelines (intentional split)

|                         | voxelBlock                                          | railWall                                                                        |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Geometry hub**        | `resolveGridWallFace` → `resolveGridVoxelBlockFace` | `resolveGridWallEdgeRailBox` → `resolveGridRailWallBox`                         |
| **Vertical projection** | `projectWorldPointInto` → `drawProjectedWallFace`   | same                                                                            |
| **Top surface**         | Chunk roof (`drawRoofs` + cell mask)                | `drawProjectedHorizontalCap` (chunk sample at footprint)                        |
| **Rejected**            | —                                                   | Face-line + `computeProjectedFace`, chunk roof strip mask, coplanar “back face” |

---

## 3D projection consolidation (locked model)

Single vertical formula: **`projectWorldPointInto`** + **`projectWallFaceBandInto`** → **`drawProjectedWallFace`**. Horizontal tops: **`projectWorldAabbCornersInto`** + chunk UV sample → **`drawProjectedHorizontalCap`**. Back-face cull: **`isOutwardFaceTowardViewer`**.

- [x] **Delete `computeProjectedFace`** — legacy angle-spread path removed; no dual vertical projection.
- [x] **Unify wall face draw** — voxelBlock + railWall sides/ends use `drawProjectedWallFace` only.
- [x] **Cap workaround** — solid fill cap; procedural cap deferred.
- [ ] **Cap alignment regression** — deferred.
- [x] **Unify back-face cull** — `isOutwardFaceTowardViewer` in `IsometricProjection.js`; voxelBlock collect + railWall draw share it.
- [x] **`WallDrawContext.gameState`** — cap chunk sample uses same bake hook as roofs.

### Damage (missing for railWall)

- [ ] **railWall damage** — voxelBlock uses `damageStaticGridCell` (cell health in `state.staticCellHealth`, clears `grid[idx]`). railWall proxies currently no-op in `handleHit` (`if (this.isEdgeRail) return`). Need per-edge health keyed by `(col, row, side)` or equivalent, decrement on hit, clear `edgeGrid` + neighbor sync on break, bump revision, invalidate draw/nav/surfaces. Visual: damage alpha on rail side atlases + cap (reuse or extend `getStaticCellDamageAlpha*` pattern).
- [ ] **voxelBlock damage unchanged** — existing cell path stays as-is; regression when railWall damage lands.

---

## Cleanup — get back up to spec

Priority order. **Do not add new micro-files** unless a module is a real subsystem (see `.cursor/rules/no-shims-and-guards.mdc`). Extend existing owners: `wallGridCells.js`, `ProjectedWallDraw.js`, `WorldObstacleGrid.js`, `StaticGrid*Draw.js`.

### P0 — Library alignment (dual paths / dead code)

- [x] P0 items from prior pass (collision comment, dead helpers, legacy face fields, revision note).

### P1 — Pipeline reuse + projection consolidation

- [x] **Extract shared viewport geom cache** — `wallGridDrawCacheHit` / `storeWallGridDrawCache` in `StaticGridWallDraw.js`; edge rail draw imports them.
- [x] **End-face atlas strategy** — per-face `atlasFaceId` + `_wallAtlasStashes` / `_wkByFace` on box; no `cacheObj = null` bust.
- [x] **Collinear merge (draw only)** — `mergeCollinearRailWallBoxes` in collect; collision proxies unchanged.

### P1 — Rail top cap (follow-up)

- [x] **Cap workaround** — solid fill via `drawProjectedRailWallCap` (procedural chunk cap deferred; alignment issue open).
- [ ] **Cap alignment regression** — pan radial camera; caps meet side tops (deferred).
- [ ] **Verify live profile edit** — sides update on profile change; cap is solid until procedural cap returns.

### P2 — Efficiency

- [x] **Cull edge rails at collect time** — `railWallBoxTowardViewer` in collect; draw uses same cull helper logic.
- [x] **Reduce per-box allocations** — flat `innerP1x`…`outerP2y` on box struct; module scratch for draw edges.
- [x] **Atlas / subdiv cache on drawable** — `_faceSubdiv` + `_faceSubdivKey` on box; invalidated on collinear merge.
- [ ] **Face-level AABB cull** — render perf backlog.

### P2 — Render mode + editor parity

- [ ] **Flat 2D mode** — `StructureDrawPass.createFlat2dStructurePass` calls `draw3DBuildings(..., { skipWalls: true })` → **no fill, no edge rails**. Only `drawFlatWallRails` (segment footprints). Document radial-only for static grid walls **or** add flat pass for static rails.
- [ ] **Map overview** — `labMapCaches.bakeObstacleOverviewCache` uses `grid[]` only; edge rails invisible on overview. Encode edges or overlay pass if overview should match stamped rails.

### P2 — Cursor rules / hygiene

- [x] **Remove `canStep` edgeGrid guard** — fail-fast; grid always allocates `edgeGrid` after init.
- [x] **Consolidate proxy factory (draw/hit only)** — shared `_staticGridProxyHandleHit` on `WorldObstacleGrid`; segment fields unchanged.
- [ ] **Acceptance gate before more features** — run checklist below after draw/cap cleanup (collision already signed off).

### P3 — New shared code (only if consolidation warrants it)

Not micro-files — extend these if elevated projection spreads:

| Extend                       | Purpose                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ProjectedWallDraw.js`       | `drawProjectedHorizontalCap` — railWall caps + future voxelBlock caps; `drawProjectedWallFace` — all vertical bands |
| `wallGridCells.js`           | Box struct, merge, collision segment builders                                                                   |
| `wallSurfaceInvalidation.js` | Single entry: geom caches + atlas memos + (future) cap bake prefixes                                            |
| `IsometricProjection.js`     | Already owns `projectWorldPointInto`; no fork                                                                   |

**Do not** add a separate `GridEdgeRailProjection.js` for &lt;20 lines; keep draw entry in `StaticGridEdgeRailDraw.js`, math in `wallGridCells.js`.

---

## Acceptance (hard gate — formal pass still open)

- [ ] Fill voxel unchanged from all angles (height, chunk roof, damage, nav, collision).
- [ ] Edge rail: long sides + end faces show thickness; top cap meets side tops in projection (single projection model; verify visually).
- [ ] Interior walkable.
- [ ] **railWall damage** — ball/projectile reduces rail health; rail breaks without clearing walkable cell interior (after damage task above).
- [ ] Thickness 2 vs 4: visible width changes (collision already tracks thickness — retest if collision touched).
- [ ] 8×1 line: continuous after collinear merge (or document seam acceptable until merge lands).
- [ ] Profile edit: side **and** cap motifs update (after procedural cap task).
- [ ] No parallel collision pass / teleport nudging.

---

## Migration / scope

- [ ] Grid-snapped map content — fill + edge only for rails (no Segment entities for stamped lines).
- [ ] **`segmentGrid`** — arbitrary-angle walls until baked.
- [ ] Conveyors — floor props only; no edge data on belt assets.

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

- [ ] **`voxelBlock` / `railWall` code rename (later phase)** — Convention locked; legacy symbols remain until a dedicated sweep. One PR, no alias passthroughs; storage fields unchanged. Mapping:
    - voxelBlock: `resolveGridWallFace` → `resolveGridVoxelBlockFace`, `collectGridWallFacesInAabb` → `collectGridVoxelBlockFacesInAabb`, `StaticGridWallDraw` → `StaticGridVoxelBlockDraw`, `staticGrid` → `staticGridVoxelBlock`, etc.
    - railWall: `resolveGridWallEdgeRailBox` → `resolveGridRailWallBox`, `StaticGridEdgeRailDraw` → `StaticGridRailWallDraw`, `staticGridEdgeRail` → `staticGridRailWall`, `isEdgeRail` → `isRailWall`, etc.
- [ ] **Naming clarity (same phase, optional)** — Editor tool labels (“voxel block” / “rail wall”), grep cleanup in comments/todo, proxy factory field names — anything that makes the convention obvious without changing behavior. Collision segment math frozen; ball retest only if proxy fields rename.
- [ ] **`drawKinematicsFrameToCanvas` bundle**
- [ ] **`NavigationContext`**
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — optional revisit if voxelBlock caps ever use per-footprint horizontal draw

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
- [ ] **Grid wall extras**: corner posts, half-height edges, doors, one-way edges, railWall damage, autotile trim — **new kinds use new names**; do not overload voxelBlock/railWall unless they truly fit the same occupancy model.
