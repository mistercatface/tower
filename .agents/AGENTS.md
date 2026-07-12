# Workspace Agent Rules

These rules are project-scoped behavior constraints for all AI agents editing the `tower` codebase.

## 1. Test Decoupling & Stability

- **KEEP TEST SPECIFIC CODE INSIDE THE TEST FOLDER. DO NOT PUT TEST CODE OUTSIDE THE TEST FOLDER.**
- **Consolidate Mocks**: Reuse harness files inside `tests/harness/` — not inline mocks in test files when used 2+ times.
- **No test-only exports in `Libraries/`** — no `*ForTests` symbols, no production branches loosened for test convenience.
- **Tests adapt to production contracts** — harness builds real wiring (`createKineticSession`, `WorldObstacleGrid`, `sandboxDragHarness`, etc.).

## 2. Test Execution

- **Run tests via Node directly**: `node scripts/run-tests.mjs tests/foo.test.js` or `npm run test:all` — not through `cmd.exe /c`.
- **Targeted runs** — one file or feature scope; avoid full suite unless the change warrants it.
- **Timeout runner** — prefer `node scripts/run-tests.mjs` over bare `node --test`.

## 3. Code Hygiene Audits

Before adding exports under `Libraries/` or finishing a feature that touches `Libraries/`:

```powershell
node scripts/audit-codebase.mjs Libraries/<area>   # path filter on changed dirs
npm run audit                                       # fail-only gate
npm run audit:all                                   # failures + warnings
```

`node scripts/audit-codebase.mjs --help` lists rules. Fail on: non-index re-export barrels, deleted passthrough symbols in monoliths, legacy sandbox drag APIs, test-only library exports, inline `mock*` factories in test files (use harness), `*_SCRATCH` exports from hot-path libs, new XY/AABB bag exports from `Core/engineMemory.js`, legacy viewport/scalar symbols.

Warnings (`--warn`) are baseline debt — do not introduce new failures. Also warn on: F32→object rebox, module `*_SCRATCH`, pair-return bags, object-bag `*Into*`, dual bag+F32 APIs, hot-path `.push({`.

## 4. Style Guards (do not reintroduce)

- No `@param` / inner `@type` in function bodies — see `.cursor/rules/jsdoc-minimal.mdc`.
- No new file splits for organization only — extend existing modules unless a real subsystem boundary.
- No fallbacks without explicit user approval — see `.cursor/rules/no-fallbacks.mdc`.
- Import from owning modules directly — minimal barrels only at package entry (`minimal-barrels.mdc`).

## 5. Grid edit → surface invalidate contract

`commitGridNavEdit(state, region, …)` and `WorldSurfaceEngine.invalidateGridBounds(region, grid)` share one `region` shape:

- `null` — full grid (with `fullNavSync` / full surface clear)
- `number` — single cell index
- CellBounds (`startCol`/`endCol`/`startRow`/`endRow`) — inclusive rectangle (wall batches, shatter flush)

Anything else must throw. Wall shatter goes quiet clear → `commitGridWallBatch(bounds)` → this path; do not stub `invalidateGridBounds` as a no-op when asserting roof/draw teardown after shatter.

## 6. Viewport / view bounds dialect

- Camera AABB: `viewBoundsBuf` + `VIEW_TIER_CLIP` / `VIEW_TIER_PROPS` / `VIEW_TIER_STRUCTURE` / `VIEW_TIER_CHUNKS` number consts in `Core/engineMemory.js` (session SoA, 4 tiers × stride 4). No `VIEW_TIER` object bag.
- Viewport zoom/position APIs call `recomputeViewBounds`; never store tiers on Viewport. Use `circleInViewBounds` for visibility (not `viewport.circleInBounds`).
- Never put camera tiers in `ENGINE_F32` Bounds bank (`B_*` are ephemeral scratch only).
- Viewport screen/world mapping is `(buf, o, …)` only (`screenToWorldF32` / `worldToScreenF32`) — **no** `return { x, y }`.
- View → registry queries return **count**; ids via `borrowedQueryIds(filterId)`. Camera: `queryViewTier(spatialFrame, tierO, filterId, match)`. Scratch AABB: `queryInAabbF32(…, buf, o, …)`. Intersection is circle vs AABB via eid SoA (`entityX`/`entityY`/`entityR`). No criteria/`opts` bags; no `queryPropIdsInView` passthrough. Do not reintroduce `BRIDGE_AABB` on that path.
- Modes (`SHAPE_TYPE_*`, `DRAW_KIND_*`, …) live in `Core/engineEnums.js`. Slabs and buffer layout offsets (`VIEW_TIER_*`) live in `Core/engineMemory.js`. Do not put semantic modes in `engineMemory`. Editor boot lives under `Apps/Editor/`, not a Core globals module.
- Zoom/position changes go through `setZoom` / `setPosition` / `snapTo` / `follow` so bounds recompute.
- Tests/harnesses that mock a viewport without a real `Viewport` must call `recomputeViewBounds` when visibility matters — no production branches for Node.

## 7. engineMemory bar + object diet

`Core/engineMemory.js` is not a junk drawer for bags. Three layers:

| Layer | Put here | Do not put here |
|-------|----------|-----------------|
| `ENGINE_F32` named slots | Ephemeral outs (snap XY, steer, closest, AABB scratch). **All bank slot consts (`M_*`/`P_*`/`G_*`/`F_*`/`S_*`/`N_*`/`B_*`/`R_*`) live only in `engineMemory`.** Libraries may keep subarray *views* (`SAT_RESULT`, etc.), not layout ownership. Body radius is `body.radius` only — no resolver. | Growable paths, topology, session clocks, camera tiers |
| Dedicated slabs / SoA | Persistent columns (`entityX`, kinetic slabs, wall segments), `viewBoundsBuf` | One-off `{x,y}` helpers, dual bag+F32 twins |
| Session / SAB / local | Worker paths, HPA graphs, editor caches | Parking more object bags in Core “for convenience” |

Illegal diet patterns (audits should catch; do not introduce):

- `*Into*` that writes `out.x` / `out.minX` instead of `(buf, o)` / named `ENGINE_F32` slots
- Reboxing: `{ x: ENGINE_F32[…], y: ENGINE_F32[…] }` after an Into/F32 write
- Dual APIs: `foo` (bag) + `fooF32` / object `fooInto` — delete the bag path
- New `export const *_SCRATCH = { x, y }` or AABB bag factories in hot libs / `engineMemory`
- Hot-path `.push({ … })` in Spatial/Physics/Navigation/Math/Sandbox

Legal: SoA slab objects already in `engineMemory` (typed columns + `count`); `GrowI32`/`GrowF32`; `viewBoundsBuf` camera SoA (not `ENGINE_F32`).

### WorldSurface dialect

- Draw/cache path: no XY/AABB return bags; `SurfaceSpatialMap` mutates `_boundsBank` (`SS_POINTS`/`SS_CHUNK`); chunk key range writes into engine `_i32`.
- World AABB cell walks use `boundsToCellRectInto` only (no allocating `boundsToCellRect` bag).
- Engine + `BakeSession` numerics live on `_f32` / `_i32` slabs (no parallel named scalar twin fields); object refs (ctx/canvas/grid/state) stay named.
- Wall atlas: `writeWallAtlasWrap(buf, o)` then `getOrEnsureWallAtlas(profileId, wallHeight)` reading `SS_POINTS` — no scalar wrap args / `wrappedP1` bags; wall face bake uses `configureWallFaceFromSession` after writing `BF_P1*`.
- Pending surface bakes: `SurfaceBitmapCache._pending` Set — `getOrStart` returns `null` (no `{ isPlaceholder }` bags); draw paths treat missing canvas as not ready.
- Surface cache / worker dedupe identity: opaque `bigint` via `encodeGroundKey` / `encodeRoofMaskKey` / `encodeRoofDrawKey` / `encodeWallKey` (sprite-cache dialect) — no colon-string keys / `toFixed` in key builders.
- Miss-path bake requests: write `_bakeReqF32` / `_bakeReqI32` then `materialize*BakePayload()` only at the worker postMessage edge.
- `TILE_WORKER_MESSAGE` / `TILE_BAKE_TIER_*` bare ints (not string labels / nested objects).
- Wall-chunk prop textures bind on the engine for the current draw (`_wallChunkSideCanvas` / `_wallChunkCapCanvas` / `_wallChunkReady`); no prop texture bags; scale/chunk size from settings.
- Bake: `configure*` then `setBakeRect` then `paintPixelArea(ctx, seed, profileId)` — no `paintOptions` bags; `composeSurfaceImage(bakeSession, profile, seed)`.
- Motif apply: `apply(sf, si, rf, ro, config, noise)` with `SF_*` / `SI_*` / `RF_*` slots; `blendMode` / `coordinateSpace` / translate modes are `BLEND_MODE_*` / `COORD_SPACE_*` / `TRANSLATE_MODE_*` ints — no string compares on the bake path.
- Warp outs: `warpPointInto(outF32, o, …)` — no `{x,y}` bags.
- Worker payloads: flat scalars only (`p1x…p2y`); no nested points.
- Modes (`WALL_FACE_*`, `PRIMITIVE_PHYSICS_ROW_*`, `SURFACE_MASK_*`, `BLEND_MODE_*`, `COORD_SPACE_*`) live in `engineEnums`, not `engineMemory`.
- Scheduler Promise records / thin queue `stats()` may remain bags (non-hot).

### Render dialect

- Wall face draw state: module `wallFaceF32` / `wallFaceI32` (`WF_*`) via `writeWallFaceScratch` / `writeWallFaceFromRailBox` / `writeWallFaceFromVoxelFace` — no `wallFaceScratch` bags; stride layouts live in `wallGridStride.js` as bare `RAIL_BOX_*` / `VOXEL_FACE_*` ints (cycle-safe vs Spatial→Render).
- Overlay glyph `customKey` / `OVERLAY_RENDER_KEY_*` are packed numbers (ints / `mixHash4`) — no `` `r${…}` `` template strings / nested key objects.
- Pending surface textures: **skip draw** (sphere / wall-chunk / atlas miss / rail cap) — no gray ball, gray prism, or `floorShadow` solid stand-in.
- Sphere mesh: fixed `SPHERE_LON_BANDS` / `SPHERE_LAT_BANDS`; `drawSphere(ctx, prop, viewport)` — no options bag.
- CSS color strings stay only at the canvas `fillStyle` / `strokeStyle` edge.
- Overlay AABB draw: `drawAabbStyle(ctx, minX, minY, maxX, maxY, …)` — no `{ minX, minY, maxX, maxY }` rebox on bake.
- `VisibleDrawQueue`: typed `kinds` / `baseIndices` / `depths` + eid column — no object `refs` shuffle.
- Grid stamps: `GRID_STAMP_RENDER_KEY_*` bare ints; filmstrip strip keys packed/role ints; bake calls `draw(ctx, hx, hy, facing, ageMs)` — no stamp stage prop proxy; blit via SoA slab + scalar frame/alpha/scale.
- Spatial wall-candidate lookup: typed I32 columns (no `sWallBucketLookup` bag); `setBoundary(grid, idx, side, cap, thickness)`.
- Aim/ray: `castSteppedCircleRay` writes F32/I32 outs + bare hit enum — no `{ hit, x, y, dist }` / string hit kinds.
- Overlay commands: write-into `overlayCommandSlab` poly arena (`beginOverlayPoly` / `writeOverlayPolyXY` / `stampOverlay*` + `OVERLAY_STYLE_*`); `behavior.appendPathOverlay(slab, prop, visual)` — no PathOverlayData / `getPathOverlay` / scratch→copy, no per-call stroke/fill/dash scalar lists on public stamps.
- Overlay colors: `styleId` + packed RGBA intern (static) / `OVERLAY_F_HUE` + drag style ints + hue ladder (dynamic) — CSS only at draw `fillStyle`/`strokeStyle`. No `slab.stroke`/`fill` string columns, no `stampOverlay*Color`, no per-frame `` `hsla(${hue}…)` ``.
- Overlay/nav hot path: `OVERLAY_DASH_PAIR`/`EMPTY` for `setLineDash` (no `[a,b]` literals); HPA/flow use cached `getKineticRollConfig(prop)` + bare `physicsSettings.groundNavHpa.stopRadius` (no override/scratch config bag); flow path visit via Uint8 epoch bitset; selection overlay reuses module Set + props array.
- No style-only domain stamp wrappers (`stampMarqueeAabb` / `stampRailEdgeSegment`) — call `stampOverlay*` + `OVERLAY_STYLE_*` at the site. No `appendGridEdgeOverlayCommand` / `appendMarqueeOverlayCommands` / `selectionRingRadius` passthroughs.
- Ground nav: `createDirectGroundNavBehavior` / `createFlowGroundNavBehavior` / `createHpaGroundNavBehavior` own runs via `createGroundNavRunSlab` SoA in `engineMemory` (typed columns allocated at create; `sessions[]` for HPA). Flags `GROUND_NAV_RUN_*` and identity `SANDBOX_BEHAVIOR_*` ints live in `engineEnums` — import those directly (no `*_BEHAVIOR_ID` aliases, no `rollToCursor*` / `grabDrag` strings, no per-prop run bags, no flow `topologyKey` string compare). `setMoveTarget(prop, x, y)` + `writeMoveTargetWorldInto(buf, o, prop)`. `driveGroundNav` writes `N_OUT_STEER`. HPA path settings scratch writes only steering fields (no `Object.assign` of full nav.settings).
- Drag aim line: `getDragLaunchAimLine(aim, prop, obstacleGrid)` — no aim-line context bag / `createDragLaunchInteraction` injection.

Before adding exports under `Libraries/` or `Core/engineMemory.js`:
`npm run audit:all` and `node scripts/audit-codebase.mjs --warn Libraries/<area>`.
