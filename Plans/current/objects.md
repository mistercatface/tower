# Hot-path allocation & scratch-object audit

Read-only audit of object creation in hot paths and places where scratch objects mask allocation that should be slabs, pools, or `*Into` APIs. Scratch-as-smell when it papers over per-frame/per-cell allocation; scratch-as-solution when it is a fixed buffer at a real hot loop boundary.

**Related:** structural fixes → [`normalization.md`](normalization.md) · frame pass → [`frame.md`](frame.md) · G1–G7 outlines → [`gamechangers.md`](gamechangers.md)

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

## Render and grid drawing are **inconsistent**: walls/projected draw reuse scratch well; some grid-stamp paths still allocate on cache rebuild (forcefields — see [`gamechangers.md`](gamechangers.md) G1). Floor belts/power are fixed ✅.

## Tier 1 — High impact (every frame, scales with visible cells/props)

### 1. Floor belt / power-source draw — fresh proxy + closure per cell ✅

**Where:** `Libraries/Sandbox/gridStampDrawCache.js` — `drawFloorOccupancyBelts`, `drawFloorOccupancyPowerSources` (draw moved from `floorOccupancy.js` in indirection pass)

## **Done:** Revision-cached draw list — stable prototype proxies, sync on `floorOccupancyStampDrawCacheKey`, per-frame viewport cull + dynamic field updates only. Rule enforced in `rendering-pipelines.mdc` §2.

### 2. Ground chunk draw — `createAabb()` + pass literal per chunk ✅

**Where:** `Libraries/WorldSurface/WorldSurfaceEngine.js` — `drawGroundChunks`

**Done:** Engine-owned `groundChunkDrawPass` + `groundChunkPassAabb` + `groundChunkPassCamera`; `chunkWorldAabbInto` + `elevationCameraFromViewportInto`; pass mutation only when `zLevel > 0` (ground blit skips pass entirely).

---

### 3. Prop / grid-stamp draw — `px/py/zoom` threaded on every blit

**Where:** `PropRenderer.drawProp`, `QuantizedSpriteCache.drawCachedPropSprite`, `gridStampDrawCache`, `drawForcefields`

**Hot because:** Every visible prop + every belt cell + forcefield blit, **including cache hits**.

`resolveSpriteDrawModifier` already takes **scalar `px, py`** (no `{ x, y }` object). Remaining smell: **camera scalars re-read and re-passed** at every layer instead of one frame-owned struct.

## **Fix:** [`frame.md`](frame.md) — `WorldSceneDrawPass` filled once per sub-pass; cache reads `pass.px/py/zoom`. Aligns with `Plans/clean.md` pass 2.

### 4. Sprite cache keys — template string every lookup ✅

**Where:** `QuantizedSpriteCache.buildPropSpriteKey`

**Hot because:** Runs on every `getOrBakePropSprite`, hit or miss.

## Pass 1: intern string identity parts + pack view/anim/zoom/pixel into `BigInt` keys; reuse one view-quant scratch per cache (no per-lookup `{ keyDx, keyDy }`). `getBaseSpriteCacheKey` still builds a physics string on lookup — defer stamp cache to a follow-up. Pass 2 (`drawPass`, positional bake) → [`frame.md`](frame.md) + `Plans/clean.md`.

## Tier 2 — Medium impact (sim tick, editor, or scale-dependent)

### 5. Wall candidate buckets — Map cleared + fresh arrays every frame

**Where:** `Libraries/Spatial/world/SpatialFrameCore.js` — `resetFrame`, `_wallCandidatesNearWorld`

Every sim tick:

- `_wallBucketCache.clear()`
- On miss: `const segments = []` + fill + `Map.set`

Physics bodies live in Float32 slabs; wall queries still use **ephemeral Map + array buckets** rebuilt from scratch each frame (with a static wall proxy pool on the grid side, but bucket containers are new).

**Smell:** You built a slab broadphase for entities but wall segment gathering is still “Map of arrays, clear and refill.” Generation-stamped bucket reuse or a fixed bucket ring would match the slab investment.

## **Outline:** [`gamechangers.md`](gamechangers.md) G3.

### 6. `gridToWorld` / `worldToGrid` — allocating helpers everywhere ✅

**Where:** `GridCoords.js`, `WorldObstacleGrid`, sim/nav/render hot paths

**Done:** Scalar API on `WorldObstacleGrid` (`worldCol`, `worldRow`, `gridCenterX`, `gridCenterY`) and `GridCoords` (`worldColAtOrigin`, `gridCenterXInCenteredFrame`, …). Hot paths use scalar locals; allocating `worldToGrid` / `gridToWorld` kept for cold APIs that return `{ col, row }` / `{ x, y }` (editor, tests, stored records). No `gridToWorldInto` — AABB `*Into` unchanged.

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

## **Outline:** [`gamechangers.md`](gamechangers.md) G5.

### 12. Floor props tick — `shapes = []` every frame

**Where:** `Libraries/Sandbox/floorProps.js` — `tickFloorProps`

**Hot when:** Any floor trigger props exist.

One array per tick, cleared by reallocation. Module-level buffer with `length = 0` is the obvious fix.

---

## Tier 3 — Lower but worth knowing

| Spot                             | Issue                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `Render.buildSimulationPipeline` | Spread + map when entity layers change — rare, fine                                                                                |
| `WorldSceneRenderer`             | Two `visibleDrawables.sort()` per frame — CPU not GC; unify after [`frame.md`](frame.md) — [`gamechangers.md`](gamechangers.md) G7 |     | `texturedCells` / `drawSphereTexturePatch` | `borrowProjectedSphereCell` grows `{ d0..d3 }` objects once — **good** scratch pattern |

---

## Where scratch **is** the right tool (not smells)

| Area                                                                          | Verdict                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `ProjectedWallDraw` — `sCorner0..3`, `sFaceBottom`, `projectWallFaceBandInto` | Correct: hot loop, fixed scratch, out-params                                   |
| `AffineTexture` — `sPoint0..3` for UV corners                                 | Correct after quad refactor                                                    |
| `losShadowOverlay` — `sQuadScratch` Float32Array, `sEdgeScratch`              | Correct                                                                        |
| `kineticBodySlab` — `SLAB_SCRATCH_A/B` for broadphase overlap                 | Correct adjunct to real slab                                                   |
| `EntityRegistry` — `_candidateScratch`, `_kindSetScratch`                     | Correct for query filtering                                                    |
| `StaticGridWallDraw` / face pool in `wallGridBake`                            | Correct: pool faces, reuse list                                                |
| `ProfileBakeResolver` / tile worker pools                                     | Real pooling, not lipstick                                                     |
| `flowFieldBfs.js` — `bfsDistances`/`bfsQueue` scratch buffers passed in       | Correct — reusable allocation off-thread; see [`fsmroadmap.md`](fsmroadmap.md) |

---

## Summary

**Heavy optimization where the type system makes it obvious (physics bodies, constraints, baked sprites), scratch-or-allocate where the domain is spatial/render (points, proxies, pass structs).** Floor belt/power grid stamps and chunk ground draw are on the good side ✅; forcefield stamp sync rebuild still allocates (G1); camera threading still pre-pass (frame.md).
The AffineTexture / `drawImageQuad` work (positional args, no `sBlitQuad` scratch) is the right _kind_ of fix — eliminate pointless object plumbing at the API boundary.

---

## Suggested fix order (ROI)

1. ~~**Floor belts** — copy forcefield revision cache, stop per-cell proxies~~ ✅
2. ~~**Chunk draw** — use existing AABB scratch + one pass struct~~ ✅
3. ~~**`gridToWorldInto`** — unlock fixes across belts, path overlay, steering~~ ✅ (scalar `worldCol`/`gridCenterX` API instead)
4. **Wall bucket cache** — [`gamechangers.md`](gamechangers.md) G3
5. **Hoist sim hooks + sleep visited** — G5 + objects #10; cheap, same mindset as removing pointless per-tick objects
6. **Frame draw pass** — [`frame.md`](frame.md) (normalization #1 / objects #3)

**Render-loop ROI:** frame pass + forcefield stamp cache (G1).

**Physics/nav ROI:** wall buckets (G3).
