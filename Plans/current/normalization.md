# Normalization audit — cross-cutting patterns that unlock whole subsystems

Unlike the completed indirection pass (wrapper/barrel cleanup), this doc tracks **structural patterns** where one API shape or one engine-owned pass struct clears up dozens of call sites — the same class of win as the bounds/AABB + scalar grid work.

**Reference win (what “big” feels like):**

| Layer | Before | After |
|-------|--------|-------|
| World bounds | Ad-hoc `{ minX, maxX, … }`, fresh objects in loops | `Aabb2D` + `createAabb` + `*Into` scratch (`chunkWorldAabbScratch`, `intersectAabbOptionalInto`) |
| Grid indices | `gridToWorld()` → `{ x, y }` in hot paths | Scalars on `WorldObstacleGrid` (`worldCol`, `gridCenterX`, …) |
| Chunk draw | New AABB + camera object per chunk | Engine-owned pass fields; ground blit skips mutation entirely |
| Floor belts | Per-cell proxy + closure every frame | Revision cache in `gridStampDrawCache.js` (sync on key, cull + blit per frame) |

Those weren’t micro-optimizations — they **picked one dialect** and made whole folders speak it.

**Do first:** [`frame.md`](frame.md) (frame draw pass) · quick win before that: [`gamechangers.md`](gamechangers.md) **G1** (forcefields → belt cache).

**Full outlines:** [`frame.md`](frame.md) · [`gamechangers.md`](gamechangers.md) (G1–G7)

---

## Tier 1 — Frame draw pass (render’s “AABB moment”)

### 1. `WorldSceneDrawPass` — one struct per frame, not `px/py/zoom` soup

**Where:** `WorldSceneRenderer`, `PropRenderer`, `QuantizedSpriteCache`, `gridStampDrawCache`, `drawForcefields`, `drawOverlayCommands`, `StructureDrawPass`, `wallCtx`

**What today:**

- `Renderer.worldSceneDrawInput` already exists for entity/spatial wiring — but **camera scalars are re-read from `viewport` in every draw method**.
- Walls use a 15-field **`wallCtx` bag** mutated per drawable (`_bindWallDrawable`).
- Props/grid stamps thread **`px, py, zoom`** through 4+ layers.
- `Plans/clean.md` describes the target: positional bake APIs + **`drawPass`** owned by the renderer.

**Why it’s the next big normalization:**

Same story as AABB: one frame-owned struct eliminates repeated parameter threading, gives walls/props/stamps/overlays a **shared camera dialect**, and is the prerequisite for finishing sprite-cache work (modifier path, optional `drawPass`-relative blit offsets).

**Fix shape:**

```text
Renderer / WorldSceneRenderer owns drawPass { px, py, zoom, camera, viewport }
  → drawFloorOccupancy*(ctx, state, viewport, drawPass)   // or drawPass only + viewport tier
  → drawProp(ctx, prop, drawPass)
  → drawCachedPropSprite(ctx, prop, drawPass, renderKey, draw, animFrame)
  → wall draw reads drawPass.camera (ElevationCamera Into scratch on pass)
```

**Not:** reintroducing `{ opts }` on hot paths — plain fields on a struct the renderer already owns.

**Touches:** ~15–25 files. **Payoff:** every render pass; aligns with `Plans/clean.md` pass 2.

---

### 2. Finish grid-stamp revision cache — forcefields on the belt pattern

**Where:** `gridStampDrawCache.js` ✅ belts/power · `drawForcefields.js` ⚠️ parallel

**What today:**

| Feature | Sync key | Proxy shape on rebuild |
|---------|----------|------------------------|
| Floor belts / power | `floorOccupancyStampDrawCacheKey` | `Object.create(proto)` — stable ✅ |
| Passage edges | `passageEdgeDrawCacheKey` | **`createForcefieldDrawProxy()` fresh literal every sync** ⚠️ |

Forcefields already have revision caching and viewport cull — but **`syncPassageEdgeDrawCache` still allocates new proxy objects + nested `{ x, y }` every time the key changes**, and lives in a separate module with duplicate cache plumbing (`clearGridStampDrawCaches` clears `_passageEdgeDrawCache` but sync lives elsewhere).

**Fix:** Move passage-edge sync + draw into `gridStampDrawCache.js` (or rename module → `gridStampDraw.js`). Stable prototype proxies like belts. One place for “sync on `gridNavEpoch` key → cull → `drawCachedPropSprite`”.

**Touches:** 2–3 files + rule doc. **Payoff:** completes the grid-stamp pipeline story; removes the last “almost cached” grid feature.

---

## Tier 2 — Spatial / sim dialect (physics parity with slabs)

### 3. Wall candidate buckets — stop Map clear + `[]` per query

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `_wallCandidatesNearWorld`

**What:** Kinetic bodies use `Float32Array` slabs; wall segment gathering still **`Map.clear()` + `const segments = []` on every bucket miss** every frame. Revision guard exists (`_wallBucketRevision`) but bucket **containers** are ephemeral.

**Fix:** Fixed bucket ring or generation-stamped arrays (same trick as broadphase visited flags). Aligns spatial sim with physics investment.

**Touches:** 1–2 files. **Payoff:** sim tick under many wall queries; same “one philosophy” as AABB/scalars.

---

### 4. Kinetic sleep / island walks — `Set` → generation stamp on slab

**Where:** `kineticPhysicsPass.js`, `kineticIslands.js`, `kineticConstraintGraph.js`, `kineticConstraintSolver.js`

**What:** Bodies on slab; graph walks allocate **`new Set()`** (sometimes nested) per pass. `islandRoot` is already `Int32Array`.

**Fix:** `Uint8Array` or generation counter on `_physId` — identical pattern to entity broadphase elsewhere.

**Touches:** 4 files. **Payoff:** physics tick GC; low conceptual risk.

---

### 5. Entity `queryView` — pool result arrays per query slot

**Where:** `GameState/EntityRegistry.js`

**What:** Good: `_candidateScratch`, `_kindSetScratch`. Bad: cache miss → **`result = []` + push**; render pass runs **3–5 queries** (debris, floor, 3D, overlays, tiles) and `spatialGen` often bumps between sim and render.

**Fix:** Fixed result buffers per known query slot (or reuse one buffer with generation tags). Same “Into/scratch” mindset as AABB.

**Touches:** 1 file + call sites that mutate returned arrays. **Payoff:** render pass under entity-heavy scenes.

---

## Tier 3 — Camera scratch family (small but spreads)

### 6. `elevationCameraFromViewport` → `Into` everywhere

**Where:** `ElevationCamera.js` has both; allocators still used in `animatedSurfaceDraw.js`, `losShadowOverlay.js`

**What:** Structure pass already uses `elevationCameraFromViewportInto` + module scratch (`sStructureRoofCamera`, `groundChunkPassCamera`, `wallPassCamera`). Animated surfaces and LOS shadow still allocate `{ viewerX, … }` per call.

**Fix:** Module scratch + `Into` at each callsite (trivial once drawPass owns a camera field).

**Touches:** 2–3 files. **Payoff:** minor alone; **fold into Tier 1 drawPass**.

---

## Tier 4 — Grid edit / invalidation spine (partially done)

### 7. Unify draw-cache bumps with `GRID_NAV_EPOCH`

**Where:** `gridNavEpoch.js`, `WorldObstacleGrid` floor writes, `floorOccupancy.js`

**What:** Nav topology uses **`bumpGridNavEpoch(grid, channel)`** + `commitGridNavEdit(bounds)`. Floor **draw** cache uses a **separate** `_floorStampDrawRevision` bumped from 4+ places (grid writes + occupancy apply paths). Keys compose both: `floorOccupancyStampDrawCacheKey = floorNavEpoch:cols:rows:_floorStampDrawRevision`.

**Smell:** Two bump mechanisms for one conceptual “floor layout changed”. Some grid mutations bump both; callers must remember the draw revision.

**Fix options (pick one):**

- **A.** Drop `_floorStampDrawRevision`; derive stamp cache key only from `floorNavEpoch` + grid dimensions (if every layout edit already bumps floor epoch).
- **B.** Centralize floor mutations through helpers that always bump the right channels (like `commitGridNavEdit` for draw + nav).

**Touches:** grid epoch + floor store writers. **Payoff:** fewer forgotten bumps; simpler mental model for “edit floor → caches invalidate”.

---

### 8. Depth-sorted drawable collection — one painter entry

**Where:** `WorldSceneRenderer` (3× query + `_distSq` + sort), `collectForcefieldEdgeDrawables`, `StaticGridWallDraw` / edge rails

**What:** Painter’s algorithm is correct but **collect → assign `_distSq` → sort** is copy-pasted with `visibleDrawables` reused as a shared buffer (good) but **logic duplicated** (floor props sort inside `drawFloorProps`; 3D sort in `draw3DBuildings`; forcefields push into same array).

**Fix:** Single `_collectDepthSorted(ctx, input, viewport, drawPass, layers)` or at least shared `_rankByDistSq(items, px, py)` + one sort before unified draw loop. Optional: merge floor props + 3D props + forcefields + walls into **one** sorted list (already the intent of `visibleDrawables` for 3D pass).

**Touches:** `WorldSceneRenderer` primarily. **Payoff:** one place to add render layers; fewer sort passes (plan.md notes two sorts/frame today).

---

## Explicitly not a “big normalization” (don’t bait yourself)

| Idea | Why skip or defer |
|------|-------------------|
| Merge `CellBounds` and `Aabb2D` into one type | Different domains (grid edit vs world space). Bridge already exists: `cellBoundsToWorldBoundsInto`, `boundsToCellRect`, `forEachObstacleGridCellInAabb`. |
| Overlay command pooling | Real win in editor, but **different pipeline** (command factories, not world draw). Do after drawPass if editor perf matters. |
| Delete `animatedSurfaceZone` registry | Dead scaffold — cleanup, not normalization. |
| First-person / fixed iso modes | New renderer branch (`Plans/rendering.md`), not consolidating overhead path. |
| More barrels / indirection | Indirection pass ✅ complete |

---

## Suggested order (ROI × normalization breadth)

| Order | Item | Why first |
|-------|------|-----------|
| **1** | **#2 Forcefields → belt cache pattern** | Small diff, finishes mandated grid-stamp pipeline, same playbook you just shipped |
| **2** | **#1 Frame drawPass** | Biggest “speak one language” win for render; unlocks `clean.md` pass 2 |
| **3** | **#7 Floor epoch / draw bump** | Makes grid edits trustworthy; pairs with #2 |
| **4** | **#3 Wall buckets** | Sim tick; independent of render |
| **5** | **#5 Query result pools** | Render entity count scaling |
| **6** | **#4 Sleep Set → stamp** | Physics GC; easy |
| **7** | **#8 Unified depth collect** | Nice after drawPass exists |

---

## How to know you got it (review bar)

- [ ] New grid stamp feature adds **one sync key + proto proxy + draw entry** — not a new cache module.
- [ ] New world draw code reads **camera from frame pass**, not `viewport.x` scattered in leaves.
- [ ] Hot grid iteration uses **scalars or `*Into`**, not `{ col, row }` / `{ x, y }`.
- [ ] Grid edit path ends in **`commitGridNavEdit(bounds)`** (or documented full sync) — draw/nav bumps not manual at each callsite.
- [ ] Sim spatial queries reuse **fixed buffers** the way kinetic slabs do.

---

## Related docs

- [`frame.md`](frame.md) — frame draw pass outline (Tier 1 #1)
- [`gamechangers.md`](gamechangers.md) — G1–G7 implementation outlines
- [`objects.md`](objects.md) — allocation/scratch audit (perf lens on same spots)
- `Plans/clean.md` — drawPass + sprite cache positional API (implementation spec for #1)
- `.cursor/rules/rendering-pipelines.mdc` — grid stamp + overlay pipeline law
