# Hot-path allocation & scratch-object audit

Read-only audit of object creation in hot paths and places where scratch objects mask allocation that should be slabs, pools, or `*Into` APIs. Scratch-as-smell when it papers over per-frame/per-cell allocation; scratch-as-solution when it is a fixed buffer at a real hot loop boundary.

---

## The split in this codebase

Physics **did** invest in real structure-of-arrays work: `kineticDynamicSlab` / `kineticConstraintSlab` are fixed `Float32Array` arenas with slot indices, not `{ x, y, vx }` objects per body.

```javascript
// Libraries/Spatial/collision/kineticBodySlab.js
export const kineticDynamicSlab = {
    x: new Float32Array(MAX_PHYS_BODIES),
    y: new Float32Array(MAX_PHYS_BODIES),
    vx: new Float32Array(MAX_PHYS_BODIES),
    // ...
};
```

Render and grid drawing are **inconsistent**: walls/projected draw reuse scratch well; floor belts still allocate like it's 2019. That mismatch is the main story.

---

## Tier 1 — High impact (every frame, scales with visible cells/props)

### 1. Floor belt / power-source draw — fresh proxy + closure per cell ✅

**Where:** `Libraries/Sandbox/floorOccupancy.js` — `drawFloorOccupancyBelts`, `drawFloorOccupancyPowerSources`

**Done:** Revision-cached draw list in `Libraries/Sandbox/gridStampDrawCache.js` — stable prototype proxies, sync on `floorOccupancyStampDrawCacheKey`, per-frame viewport cull + dynamic field updates only. Rule enforced in `rendering-pipelines.mdc` §2.

---

### 2. Ground chunk draw — `createAabb()` + pass literal per chunk

**Where:** `Libraries/WorldSurface/WorldSurfaceEngine.js` — chunk loop in ground draw

**Hot because:** All visible chunks every frame (zoom 5 = many chunks).

Each chunk:

- Full `pass = { chunkCol, chunkRow, … }` object (~12 fields)
- `chunkWorldAabbInto(createAabb(), …)` — **new AABB object per chunk**

There is already `chunkWorldAabbScratch()` in `GridCoords.js` documented for sequential chunk use. This loop ignores it and calls `createAabb()` instead.

**Smell:** Classic “we have the right tool, wrong call site.” One module-level `pass` + one AABB scratch would zero this.

---

### 3. Prop / grid-stamp draw — `{ x: px, y: py }` on every blit

**Where:** `PropRenderer.drawProp`, `QuantizedSpriteCache.drawCachedPropSprite` → `resolveSpriteDrawModifier(prop, { x: px, y: py })`

**Hot because:** Every visible prop + every belt cell + forcefield blit, **including cache hits**.

`WorldSceneRenderer` already keeps `propDrawContext` with `px/py` — but the modifier path still allocates a viewport point object per call.

**Smell:** Scratch is the right fix; it's just not threaded through. One module-level viewport scratch passed into modifier resolution would match what wall draw already does with `wallPassCamera`.

---

### 4. Sprite cache keys — template string every lookup

**Where:** `QuantizedSpriteCache.buildPropSpriteKey`

**Hot because:** Runs on every `getOrBakePropSprite`, hit or miss.

Each draw builds a new concatenated string (~80–120 chars). The LRU cache is real optimization; the **key construction** is still per-call allocation. Next step if this matters: numeric tuple key, reusable char buffer, or intern table — not more scratch objects.

---

## Tier 2 — Medium impact (sim tick, editor, or scale-dependent)

### 5. Wall candidate buckets — Map cleared + fresh arrays every frame

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `resetFrame`, `_wallCandidatesNearWorld`

Every sim tick:

- `_wallBucketCache.clear()`
- On miss: `const segments = []` + fill + `Map.set`

Physics bodies live in Float32 slabs; wall queries still use **ephemeral Map + array buckets** rebuilt from scratch each frame (with a static wall proxy pool on the grid side, but bucket containers are new).

**Smell:** You built a slab broadphase for entities but wall segment gathering is still “Map of arrays, clear and refill.” Generation-stamped bucket reuse or a fixed bucket ring would match the slab investment.

---

### 6. `gridToWorld` / `worldToGrid` — allocating helpers everywhere

**Where:** `Libraries/Spatial/grid/GridCoords.js`

**Hot because:** Called from belts (#1), path overlay, steering, floor tick — multiplies every caller's cost.

```javascript
export function gridToWorldAtOrigin(col, row, minX, minY, cellSize) {
    return { x: minX + col * cellSize + cellSize / 2, y: minY + row * cellSize + cellSize / 2 };
}
```

Half the codebase has `*Into` out-params (`projectPropVertexInto`, `elevationCameraFromViewportInto`, `chunkWorldAabbInto`, `centerReachAabbInto`). Grid coords never got the same treatment. This is the biggest **half-migrated API** in the repo.

---

### 7. Entity view queries — fresh result arrays on cache miss

**Where:** `GameState/EntityRegistry.js` — `queryView`

**Hot because:** 3–5+ queries per render pass (debris, floor, 3D, overlays, tiles).

Good: `_candidateScratch`, `_kindSetScratch` for filtering.

Bad: cache miss → `result = []` + pushes; `spatialGen` bumps on both sim `begin` and render `syncWorldSceneDrawInput`, so render tier often sees a fresh generation.

Scratch for **candidates** is correct; **result arrays** could be pooled per query slot.

---

### 8. Overlay command rebuild — new array + Set + command objects

**Where:** `buildSandboxOverlayCommands.js` → `preview.js` zIndex 15

**Hot when:** Editor open with selection/path debug.

Every frame: `commands = []`, `new Set(selectionPropIds(...))`, each overlay factory returns a fresh command literal. Cached overlay **glyphs** are done right (`overlayCached*`); the **command list** is not reused.

---

### 9. HPA path overlay — SAB → JS arrays of `{x,y}`

**Where:** `Libraries/Pathfinding/hpaPathSlot.js` — `buildSabPathOverlayFromProgress`

**Hot when:** Path overlay visible on selected agent.

Path lives in shared array buffer (good). Overlay trace materializes `pathNodes = []` and pushes `gridToWorld` points (and spreads in abstract path). The storage is serious; the **visualization path** is still allocate-on-read.

---

### 10. Simulation hooks — new object + closures every tick

**Where:** `Apps/Editor/engine.js` — `simulationKineticHooks(state)` inside `runSimulationTick`

Every unpaused frame: new hooks object + 4 inline arrow functions. Trivial to hoist to module scope with `state` from closure or a single `hooks` field on game state. Easy win, low drama.

---

### 11. Kinetic sleep / islands — `new Set()` in hot paths

**Where:** `kineticPhysicsPass.js` (`tickKineticSleep`), `kineticIslands.js`, `kineticConstraintGraph.js`, parts of `kineticConstraintSolver.js`

Bodies: Float32Array slab.

Island/sleep/graph walks: **`new Set()` per pass**, sometimes nested Sets.

**Smell:** Same subsystem, two philosophies. `islandRoot` is already an `Int32Array` on the slab — visited tracking could be a `Uint8Array` generation stamp on `_physId` (same trick broadphase uses elsewhere) instead of Set allocation.

---

### 12. Floor props tick — `shapes = []` every frame

**Where:** `Libraries/Sandbox/floorProps.js` — `tickFloorProps`

**Hot when:** Any floor trigger props exist.

One array per tick, cleared by reallocation. Module-level buffer with `length = 0` is the obvious fix.

---

## Tier 3 — Lower but worth knowing

| Spot | Issue |
|------|--------|
| `animatedSurfaceDraw.js` | `elevationCameraFromViewport()` allocates; should be `Into` like structure pass |
| `PropRenderer` / bake miss | `{ ...prop }`, full sphere mesh + `[...faces].sort` on LRU miss — fine steady-state, painful on zoom/pan miss storms |
| `Render.buildSimulationPipeline` | Spread + map when entity layers change — rare, fine |
| `WorldSceneRenderer` | Two `visibleDrawables.sort()` per frame — CPU not GC |
| `texturedCells` / `drawSphereTexturePatch` | `borrowProjectedSphereCell` grows `{ d0..d3 }` objects once — **good** scratch pattern |

---

## Where scratch **is** the right tool (not smells)

| Area | Verdict |
|------|---------|
| `ProjectedWallDraw` — `sCorner0..3`, `sFaceBottom`, `projectWallFaceBandInto` | Correct: hot loop, fixed scratch, out-params |
| `AffineTexture` — `sPoint0..3` for UV corners | Correct after quad refactor |
| `losShadowOverlay` — `sQuadScratch` Float32Array, `sEdgeScratch` | Correct |
| `kineticBodySlab` — `SLAB_SCRATCH_A/B` for broadphase overlap | Correct adjunct to real slab |
| `EntityRegistry` — `_candidateScratch`, `_kindSetScratch` | Correct for query filtering |
| `StaticGridWallDraw` / face pool in `wallGridBake` | Correct: pool faces, reuse list |
| `ProfileBakeResolver` / tile worker pools | Real pooling, not lipstick |

---

## Summary

**Heavy optimization where the type system makes it obvious (physics bodies, constraints, baked sprites), scratch-or-allocate where the domain is spatial/render (points, proxies, pass structs), and no optimization where grid iteration meets the prop cache (belts, chunk passes).**

The AffineTexture / `drawImageQuad` work (positional args, no `sBlitQuad` scratch) is the right *kind* of fix — eliminate pointless object plumbing at the API boundary.

---

## Suggested fix order (ROI)

1. ~~**Floor belts** — copy forcefield revision cache, stop per-cell proxies~~ ✅
2. **Chunk draw** — use existing AABB scratch + one pass struct
3. **`gridToWorldInto`** — unlock fixes across belts, path overlay, steering
4. **Wall bucket cache** — stop clearing Map + `[]` every frame; align with slab philosophy
5. **Hoist sim hooks + sleep visited** — cheap, same mindset as removing `{ bleedPx: 1 }` objects

**Render-loop ROI:** floor belts + chunk AABB.

**Physics/nav ROI:** wall buckets + grid `Into`.
