# todo

## Current — unified grid walls (`WorldObstacleGrid` fill + edge)

One lattice for grid-snapped wall geometry.

- **`fill[idx]`** — `grid[]`: 0 = open, 1+ = static cell height (voxel block).
- **`edge[idx]` + `edgeThicknessGrid`** — N/E/S/W rail on cell boundary; interior stays walkable.

### Two render pipelines (intentional split)

| | Fill voxels | Edge rails |
|---|---|---|
| **Geometry hub** | `resolveGridWallFace` | `resolveGridWallEdgeRailBox` |
| **Vertical projection** | `computeProjectedFace` → `drawProjectedWallFace` | `projectWorldPointInto` → `drawProjectedWallFaceElevated` |
| **Top surface** | Chunk roof (`drawRoofs` + cell mask) | In-pass cap quad (`drawProjectedGridEdgeRail`) |
| **Rejected** | — | Face-line + `computeProjectedFace`, chunk roof strip mask, coplanar “back face” |

---

## Done (working baseline)

### Data + nav

- [x] **`edgeGrid` / `edgeThicknessGrid`** on `WorldObstacleGrid`; neighbor sync in `writeCellEdge`.
- [x] **`wallGridRevision`** on fill stamp, edge stamp/delete, cavern rail gen.
- [x] **`canStep`** — fill occupancy + shared edge height for pathfinding.
- [x] **`gridWallEdgeRailShouldEmit`** — one physical rail per shared boundary (S/E owners; N/W at map edge only).

### Geometry (`Libraries/World/wallGridCells.js`)

- [x] **`resolveGridWallEdgeRailBox`** — footprint AABB, inner/outer side lines, cap Z, thickness.
- [x] **`collectGridEdgeRailBoxesInAabb`** — separate from fill face collector.
- [x] **`collectGridWallFacesInAabb`** — fill cells only (`resolveGridWallFace` skips `edgeLevel > 0`).
- [x] Fill roofs unchanged — `buildStaticRoofMaskCanvas` / `collectStaticRoofHeightsFromGrid` are fill-only (no edge strip).

### Draw

- [x] **`StaticGridEdgeRailDraw.drawProjectedGridEdgeRail`** — inner/outer long faces + **end faces** (thickness visible) + top cap quad.
- [x] **`ProjectedWallDraw.drawProjectedWallFaceElevated`** / **`projectWallFaceBandInto`** — elevated projection shared with roofs/props.
- [x] **`WorldSceneRenderer`** branches `staticGridEdgeRail` vs `staticGrid`.
- [x] Draw cache invalidation wired — `wallSurfaceInvalidation.invalidateWallAtlasKeyMemos` clears wall + edge rail geom caches.

### Editor

- [x] Wall tool: solid fill vs edge line, side, thickness, stamp/delete.
- [x] `stampWallEdgesInBounds` / `deleteStaticWallsInBounds`; invalidates surfaces + nav + map caches.
- [x] Cavern rail gen (`generateLabRailCaverns`) writes `edgeGrid`.

### Collision + nav (frozen — do not break)

- [x] **`appendStaticWallProxiesNear`** inline segment build for edge rails — boundary line + `edgeThicknessGrid` as segment `height`; **verified working; treat as source of truth**.
- [x] Fill voxels — cell-center proxy unchanged.
- [x] **`canStep`** — edge crossing blocks nav correctly.

**Constraint for all cleanup:** draw/roof/refactor work must **not** change collision proxy placement, segment `width`/`height`/`angle`, or `canStep` semantics unless a deliberate collision task is opened with before/after ball tests. Prefer leaving inline collision as-is over “wiring” to unused helpers.

`gridWallEdgeRailToCollisionSegment` in `wallGridCells.js` is **documentary / future-only** — do not swap it in unless proven byte-for-byte equivalent to the inline path (same center, angle, thickness).

### Acceptance (user-verified working)

- [x] Edge rail reads as a thin 3D box (long sides + ends + cap) in radial mode after end-face pass.
- [x] Ball bounces off visible rail face / boundary — **collision matches draw; do not regress**.
- [ ] Formal regression checklist below still needs a signed pass (fill unchanged, thickness visual, 8×1 continuity).

---

## Cleanup — get back up to spec

Priority order. **Do not add new micro-files** unless a module is a real subsystem (see `.cursor/rules/no-shims-and-guards.mdc`). Extend existing owners: `wallGridCells.js`, `ProjectedWallDraw.js`, `WorldObstacleGrid.js`, `StaticGrid*Draw.js`.

### P0 — Library alignment (dual paths / dead code)

**Collision is out of scope** unless explicitly tasked with ball-on-rail regression tests (see frozen section above).

- [ ] **Document collision ownership** — Comment at `appendStaticWallProxiesNear` that inline rail segment math is intentional and tested; either delete unused `gridWallEdgeRailToCollisionSegment` / `gridWallFaceToCollisionSegment` **or** mark `@deprecated unused — inline path is canonical` (no wiring swap without equivalence proof).
- [ ] **Remove unused imports** — `WorldObstacleGrid.js` imports collision helpers that aren’t called (safe cleanup only).
- [ ] **Drop legacy face fields on fill** — `resolveGridWallFace` still returns `isEdgeRail: false`, `edgeThickness: 0` from unified-face era; edge never flows here.
- [ ] **`writeCellEdge` vs revision** — `writeCellEdge` does not bump `wallGridRevision`; all callers must remember to bump. Consider `stampCellEdge` as the only public mutator or bump inside `writeCellEdge` (pick one; no dual “maybe synced” paths).

### P1 — Pipeline reuse + projection consolidation

- [ ] **Unify elevated wall draw** — Fill still on `drawProjectedWallFace` (`computeProjectedFace`); rails on `drawProjectedWallFaceElevated`. Backlog: migrate fill to elevated path so walls/roofs/rails share one projection model (`todo.md` refactors section).
- [ ] **Extract shared viewport geom cache** — `geomCacheHit` / `storeGeomCache` in `StaticGridWallDraw.js` and `boxCacheHit` / `storeBoxCache` in `StaticGridEdgeRailDraw.js` are copy-paste. Colocate one helper in `StaticGridWallDraw.js` (or inline next to collectors); both importers use it.
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
- [ ] **Delete `stampCellFill` alias** if nothing calls it (passthrough to `stampStaticWalls`).
- [ ] **Acceptance gate before more features** — run checklist below after draw/cap cleanup (collision already signed off).

### P3 — New shared code (only if consolidation warrants it)

Not micro-files — extend these if elevated projection spreads:

| Extend | Purpose |
|---|---|
| `ProjectedWallDraw.js` | `drawProjectedHorizontalCap(ctx, minX, minY, maxX, maxY, z, wallCtx)` for rail caps + future fill cap migration |
| `wallGridCells.js` | Box struct, merge, collision segment builders |
| `wallSurfaceInvalidation.js` | Single entry: geom caches + atlas memos + (future) cap bake prefixes |
| `IsometricProjection.js` | Already owns `projectWorldPointInto`; no fork |

**Do not** add a separate `GridEdgeRailProjection.js` for &lt;20 lines; keep draw entry in `StaticGridEdgeRailDraw.js`, math in `wallGridCells.js`.

---

## Acceptance (hard gate — formal pass still open)

- [ ] Fill voxel unchanged from all angles (height, chunk roof, damage, nav, collision).
- [x] Edge rail: ball hits boundary segment (not cell center) — **regression-sensitive; retest if collision touched**.
- [ ] Edge rail: long sides + end faces show thickness; top cap meets side tops in projection.
- [ ] Interior walkable.
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
- [ ] **Grid wall extras**: corner posts, half-height edges, doors, one-way edges, per-edge damage, autotile trim.
