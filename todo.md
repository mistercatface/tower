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
| **Vertical projection** | `computeProjectedFace` → `drawProjectedWallFace`    | `projectWorldPointInto` → `drawProjectedWallFaceElevated`                       |
| **Top surface**         | Chunk roof (`drawRoofs` + cell mask)                | In-pass cap quad (`drawProjectedGridRailWall`)                                  |
| **Rejected**            | —                                                   | Face-line + `computeProjectedFace`, chunk roof strip mask, coplanar “back face” |

---

### Damage (missing for railWall)

- [ ] **railWall damage** — voxelBlock uses `damageStaticGridCell` (cell health in `state.staticCellHealth`, clears `grid[idx]`). railWall proxies currently no-op in `handleHit` (`if (this.isEdgeRail) return`). Need per-edge health keyed by `(col, row, side)` or equivalent, decrement on hit, clear `edgeGrid` + neighbor sync on break, bump revision, invalidate draw/nav/surfaces. Visual: damage alpha on rail side atlases + cap (reuse or extend `getStaticCellDamageAlpha*` pattern).
- [ ] **voxelBlock damage unchanged** — existing cell path stays as-is; regression when railWall damage lands.

---

## Cleanup — get back up to spec

Priority order. **Do not add new micro-files** unless a module is a real subsystem (see `.cursor/rules/no-shims-and-guards.mdc`). Extend existing owners: `wallGridCells.js`, `ProjectedWallDraw.js`, `WorldObstacleGrid.js`, `StaticGrid*Draw.js`.

### P0 — Library alignment (dual paths / dead code)

### P1 — Pipeline reuse + projection consolidation

- [ ] **Unify elevated wall draw** — Fill still on `drawProjectedWallFace` (`computeProjectedFace`); rails on `drawProjectedWallFaceElevated`. Backlog: migrate fill to elevated path so walls/roofs/rails share one projection model (`todo.md` refactors section).
- [x] **Extract shared viewport geom cache** — `wallGridDrawCacheHit` / `storeWallGridDrawCache` in `StaticGridWallDraw.js`; edge rail draw imports them.
- [ ] **End-face atlas strategy** — `drawProjectedGridEdgeRail` sets `wallCtx.cacheObj = null` per end face to bust long-side atlas reuse. Correct visually, costly on straight runs. Fix: end-cap atlas key in `WallSurfaceCache` / `_wallAtlasStash` keyed by `(box id, endIndex, profileRev)` or bake end UV from box footprint without nulling cache.
- [ ] **Collinear merge (draw only first)** — merge boxes for render; **do not merge collision proxies** until draw merge is proven and collision task explicitly opened with ball tests.

### P1 — Rail top cap: procedural surface + profile invalidation (mid priority)

**Current gap:** Side faces use `getOrEnsureWallAtlas` + profile revision in cache key. Top cap uses solid `wallCtx.fillStyle` (`#12161c`) — **no procedural pattern**, no profile coherence with sides.

- [ ] **Procedural rail cap** — Draw cap via horizontal surface sample at rail footprint + `capZ`, same projection as sides (`projectWorldAabbCornersInto` + `drawProjectedHorizontalChunk` or thin wrapper in `ProjectedWallDraw.js` / `ChunkDrawPass.js`). Scope to footprint AABB, not full cell chunk mask.
- [ ] **Profile change invalidation** — When editor profile changes (`preview.js` → `invalidateWallAtlasKeyMemos`), side atlases refresh; cap does not (not in atlas path). Cap cache key must include `profileId`, `getSurfaceProfileRevision`, footprint, `wallCapHeight`, `edgeThickness`.
- [ ] **Do not re-add edge rails to chunk roof mask** — fill roofs stay full-cell; rail caps stay per-box elevated quads with their own bake/cache prefix.
- [ ] **Verify live profile edit** — Change `poolTableFelt` (or active profile) with rails on screen: sides **and** cap update without grid re-stamp.

### P2 — Efficiency

- [ ] **Cull edge rails at collect time** — Fill culls in `collectStaticGridWallDrawables`; rails cull in draw only → extra sort entries. Mirror `sideFaceVisible` at collect (or cheap AABB vs viewer hemisphere).
- [ ] **Reduce per-box allocations** — `resolveGridWallEdgeRailBox` allocates four `{x,y}` objects per emitted rail on cache miss; reuse scratch or store flat numbers on box struct.
- [ ] **Atlas / subdiv cache on drawable** — `computeWallFaceSubdiv` recomputed per draw; backlog item still applies.
- [ ] **Face-level AABB cull** — render perf backlog.

### P2 — Render mode + editor parity

- [ ] **Flat 2D mode** — `StructureDrawPass.createFlat2dStructurePass` calls `draw3DBuildings(..., { skipWalls: true })` → **no fill, no edge rails**. Only `drawFlatWallRails` (segment footprints). Document radial-only for static grid walls **or** add flat pass for static rails.
- [ ] **Map overview** — `labMapCaches.bakeObstacleOverviewCache` uses `grid[]` only; edge rails invisible on overview. Encode edges or overlay pass if overview should match stamped rails.

### P2 — Cursor rules / hygiene

- [ ] **Remove `canStep` edgeGrid guard** if `edgeGrid` is always allocated after grid init (fail-fast rule — let missing grid throw upstream).
- [ ] **Consolidate proxy factory (draw/hit only)** — duplicate `handleHit` / `isEdgeRail` shapes in `appendStaticWallProxiesNear`; refactor shape only, **no segment field changes**.
- [ ] **Acceptance gate before more features** — run checklist below after draw/cap cleanup (collision already signed off).

### P3 — New shared code (only if consolidation warrants it)

Not micro-files — extend these if elevated projection spreads:

| Extend                       | Purpose                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ProjectedWallDraw.js`       | `drawProjectedHorizontalCap(ctx, minX, minY, maxX, maxY, z, wallCtx)` for rail caps + future fill cap migration |
| `wallGridCells.js`           | Box struct, merge, collision segment builders                                                                   |
| `wallSurfaceInvalidation.js` | Single entry: geom caches + atlas memos + (future) cap bake prefixes                                            |
| `IsometricProjection.js`     | Already owns `projectWorldPointInto`; no fork                                                                   |

**Do not** add a separate `GridEdgeRailProjection.js` for &lt;20 lines; keep draw entry in `StaticGridEdgeRailDraw.js`, math in `wallGridCells.js`.

---

## Acceptance (hard gate — formal pass still open)

- [ ] Fill voxel unchanged from all angles (height, chunk roof, damage, nav, collision).
- [ ] Edge rail: long sides + end faces show thickness; top cap meets side tops in projection.
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
- [ ] **Migrate fill voxels to `drawProjectedWallFaceElevated`** (unify projection with rails/roofs)
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — revisit after rail cap bake path exists

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
