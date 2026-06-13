# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

One lattice for grid-snapped wall geometry.

**Canonical terms (locked):** **`voxelBlock`** vs **`railWall`**. Use these in chat, docs, and **new** code/comments. Never say “grid wall”, “fill”, or “edge rail” when you mean one of the two — always pick the term. **Not expected to change** unless a third static-grid geometry kind is added.

**Storage:** `grid[]` (voxelBlock) + `edgeStore` (railWall: `{ kind, heightDelta, thicknessLevel }`). Stamp API still accepts absolute cap level; stored as delta above neighbor fill.

**Code rename** (symbols/files still say `GridWall`, `EdgeRail`, `staticGrid`, etc.) — deferred to **later refactor phase**; see Backlog → Refactors. No dual aliases when that lands.

|               | **voxelBlock**    | **railWall**                                   |
| ------------- | ----------------- | ---------------------------------------------- |
| **Occupancy** | Whole cell solid  | Thin strip on cell boundary; interior walkable |
| **Storage**   | `grid[idx]`       | `edgeStore` slots + pooled edge objects        |
| **Geometry**  | vertical face     | thin box                                       |
| **Collision** | cell-center proxy | boundary segment (inline; frozen)              |

- **`grid[idx]`** — voxelBlock height (0 = open, 1+ = static cell height).
- **`edgeStore`** — railWall on N/E/S/W boundary (`kind: 'railWall'`, cap = neighbor fill + `heightDelta`).

### Wired (both kinds share the same pipeline hooks)

| Area | voxelBlock | railWall |
| ---- | ---------- | -------- |
| **Stamp / delete** | `stampStaticWallsInBounds`, cavern fill | `stampWallEdgesInBounds`, cavern edge grids; `deleteStaticWallsInBounds` clears both |
| **Nav** | `isBlocked` | `canStep` blocks cardinal/diagonal crossing stamped edges |
| **Collision** | cell-center proxy | boundary segment proxy (`isEdgeRail`); `damageStaticGridEdge` on hit |
| **3D draw** | `collectStaticGridWallDrawables` → `drawProjectedWallFace` | `collectStaticGridEdgeRailDrawables` → sides/ends + `drawProjectedRailWallCap` |
| **Top surface** | chunk roof (`drawRoofs` + cell mask at `grid[]` heights) | procedural cap (chunk sample at `wallBaseZ`, projected at cap height) |
| **Invalidate** | `bumpWallGridRevision`, `invalidateGridBounds`, draw geom caches | same revision + invalidation path |
| **Projection** | `projectWorldPointInto` + `drawProjectedWallFace` | same vertical path; cap uses per-corner chunk UV |
| **Flat 2D** | chunk clip + footprint damage | `clipChunkToFlatWallFootprints`, `drawStaticEdgeRailFootprintDamageOverlays` |

### Two render pipelines (intentional split)

|                         | voxelBlock                                          | railWall                                                                        |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Geometry hub**        | `resolveGridWallFace` → `resolveGridVoxelBlockFace` | `resolveGridWallEdgeRailBox` → `resolveGridRailWallBox`                         |
| **Vertical projection** | `projectWorldPointInto` → `drawProjectedWallFace`   | same                                                                            |
| **Top surface**         | Chunk roof (`drawRoofs` + cell mask)                | `drawProjectedRailWallCap` (chunk sample at footprint `wallBaseZ`)              |
| **Rejected**            | —                                                   | Face-line + `computeProjectedFace`, chunk roof strip mask, coplanar “back face” |

---

## Next — edge grid vs regular grid (priority)

### P0 — Gameplay parity

- [x] **railWall damage** — `damageStaticGridEdge`, `getStaticEdgeDamageAlphaAt`, cap/side overlays, editor/map delete clears edge health keys.
- [ ] **voxelBlock damage regression** — re-verify cell path unchanged after edgeStore migration.

### P1 — Ship gate

- [ ] **Acceptance checklist** — run formal pass below (collision already signed off; caps “good enough” for now).
- [ ] **Verify live profile edit** — sides and caps should both update on profile change (re-test after procedural cap fix).

### P2 — Editor / tooling parity

- [ ] **Editor labels** — map wall tool still says “Solid fill” / “Edge line”; align UI copy with voxelBlock / railWall (optional naming-clarity pass with code rename).
- [ ] **Height edit for railWall** — `setStaticWallHeightInBounds` only touches `grid[]`; no UI to raise/lower stamped edges without re-stamp. Wire height slider for edge mode or extend setter to `edgeStore`.
- [ ] **Map overview** — `bakeObstacleOverviewCache` uses `grid[]` only; stamped railWalls invisible. Encode edges (e.g. tint or overlay) if overview should match play view.

### P3 — Polish / perf

- [ ] **Cap alignment regression** — pan radial camera; caps meet side tops (low priority — deferred).
- [ ] **Face-level AABB cull** — render perf backlog.

---

## Acceptance (hard gate — formal pass still open)

- [ ] Fill voxel unchanged from all angles (height, chunk roof, damage, nav, collision).
- [ ] railWall: long sides + end faces show thickness; top cap meets side tops in projection.
- [ ] Interior walkable through cells with railWalls only (`canStep` + collision spot-check).
- [ ] **railWall damage** — ball/projectile breaks rail without clearing walkable cell interior.
- [ ] Thickness 2 vs 4: visible width changes (collision already tracks thickness — retest after edgeStore).
- [ ] 8×1 line: continuous after collinear merge (chunk-boundary merge blocked).
- [ ] Profile edit: side and cap motifs update.
- [ ] No parallel collision pass / teleport nudging.

---

## Migration / scope

- [ ] Grid-snapped map content — fill + edge only for rails (no Segment entities for stamped lines). Editor + cavern gen wired; audit remaining Segment stamp paths.
- [ ] **`segmentGrid`** — arbitrary-angle walls until baked (third kind; not voxelBlock/railWall).
- [ ] Conveyors — floor props only; add `EDGE_KIND.Conveyor` edge kind when belt edges land.

---

## Backlog

### CellEdgeStore (follow-ups)

- [ ] **Conveyor edge kind** — `EDGE_KIND.Conveyor` stub exists; wire one-way crossing + draw when conveyor tool ships.
- [ ] **Rail height edit in editor** — raise/lower stamped edges via `heightDelta` without re-stamp.

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

- [ ] **`voxelBlock` / `railWall` code rename (later phase)** — Convention locked; legacy symbols remain until a dedicated sweep. One PR, no alias passthroughs. Mapping:
    - voxelBlock: `resolveGridWallFace` → `resolveGridVoxelBlockFace`, `collectGridWallFacesInAabb` → `collectGridVoxelBlockFacesInAabb`, `StaticGridWallDraw` → `StaticGridVoxelBlockDraw`, `staticGrid` → `staticGridVoxelBlock`, etc.
    - railWall: `resolveGridWallEdgeRailBox` → `resolveGridRailWallBox`, `StaticGridEdgeRailDraw` → `StaticGridRailWallDraw`, `staticGridEdgeRail` → `staticGridRailWall`, `isEdgeRail` → `isRailWall`, etc.
- [ ] **Naming clarity (same phase, optional)** — Editor tool labels, grep cleanup in comments/todo, proxy factory field names. Collision segment math frozen; ball retest only if proxy fields rename.
- [ ] **`drawKinematicsFrameToCanvas` bundle**
- [ ] **`NavigationContext`**
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — optional revisit if voxelBlock caps ever use per-footprint horizontal draw

### Render / bake perf

- [x] **Cache `computeWallFaceSubdiv` on drawable** — `_faceSubdiv` + `_faceSubdivKey` on box/face cacheObj.
- [ ] **`blitWallFaceSubdiv` row/col band tables**
- [ ] **Face-level AABB cull**
- [ ] **`composeSurfaceImage` per-motif passes**
- [x] **Read `getTexelResolution` once per draw pass**
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
- [ ] **Grid wall extras**: corner posts, half-height edges, doors, one-way edges, autotile trim — **new kinds use new names**; do not overload voxelBlock/railWall unless they truly fit the same occupancy model.
