# Indirection audit — pointless hops, dead exports, false parity

Passthrough wrappers, split functions with one caller, exports nothing uses, and “symmetry” with another path that never needed matching structure. Not perf work (`Plans/plan.md`) — this is **navigation tax**: extra names to grep through for zero behavior.

**Pattern to kill:** `A → B → C` where `B` adds no logic, no second consumer, and no test reason to exist as a separate symbol.

**Not this doc:** legitimate shared helpers (2+ real call sites), domain boundaries that enforce invariants, `*Into` scratch at hot loops, barrels that are the actual package entry (`Pathfinding/index.js`).

---

## Already fixed (reference)

### `buildOverlaySpriteKey` + `packOverlaySpriteKey`

Was: two functions, one call site, identical to inlining the `BigInt` pack into `getOrBakeOverlaySprite`. Removed — same behavior, fewer names.

### `drawWorldProp.js` + `propDrawContext` (Tier 1 #1)

Was: whole file forwarded to `PropRenderer.drawProp`; `viewport` and `gameState` on context unused. Deleted file. `WorldSceneRenderer` calls `this.props.drawProp(ctx, prop, px, py, zoom)` directly. `propDrawContext` removed. `drawProp` takes scalar `zoom` (and `animFrame`), not `{ zoom }`.

### Floor belt draw — `{ px, py }` camera object (partial Tier 4 #21)

Was: `drawFloorOccupancyBelts/PowerSources(..., { px, py })` → gridStampDrawCache destructured `camera`. Now `px, py` scalars through the chain. **Still open:** `floorOccupancy.js` wrapper layer (guards only) — see Tier 4 #21.

### Two prop blit paths — `PropRenderer` through `drawCachedPropSprite` (Tier 1 #2)

Was: `PropRenderer.drawProp` called `getOrBakePropSprite` + `blitAnchoredSprite` directly because `drawCachedPropSprite` did not forward `propRecipes`. Now one path: `drawCachedPropSprite(ctx, prop, px, py, renderKey, draw, animFrame, zoom, propRecipes)` — positional scalars, no opts object.

### Prop sprite key split + test export (Tier 1 #3, #4)

Was: `buildPropSpriteKey` + `packPropSpriteKey` (one caller); export leaked for one parity test. Removed both symbols; `BigInt` pack inlined in `getOrBakePropSprite`. Test asserts attachment facing keys via `getVisualAttachmentSpriteCacheKey` instead.

---

## Tier 1 — Render / sprite cache

### 5. `getOrBakeOverlaySprite` — exported, one internal caller

**Where:** `Libraries/Canvas/QuantizedSpriteCache.js`

**What:** Exported bake API. Only caller: `drawCachedOverlayGlyph` in the same file.

**Why it's bullshit:** Suggests a second overlay entry point. There isn’t one.

**Fix:** Stop exporting; module-private bake helper behind `drawCachedOverlayGlyph`.

---

### 6. `getOrBakePropSprite` — exported bake layer (still open)

**Where:** `Libraries/Canvas/QuantizedSpriteCache.js`

**What:** Exported bake API. Only production caller is `drawCachedPropSprite` in the same file (~~PropRenderer imported it directly~~ — fixed in #2).

**Why it's bullshit:** Callers should use `drawCachedPropSprite`; exported bake suggests a second entry point.

**Fix:** Unexport; keep module-private behind `drawCachedPropSprite`.

---

### 7. `clearOverlaySpriteCache` — dead export

**Where:** `Libraries/Canvas/QuantizedSpriteCache.js`

**What:** Clears overlay LRU only. **Zero importers.** `clearPropSpriteCache()` already clears overlay cache + intern table.

**Fix:** Delete `clearOverlaySpriteCache`.

---

### 8. `createQuantizedSpriteCache` — exported factory, zero external use

**Where:** `Libraries/Canvas/QuantizedSpriteCache.js`

**What:** Exported. Only used to construct module-private `propSpriteCache` and `overlaySpriteCache` in the same file.

**Why it's bullshit:** “Future generic cache” export that never got a second consumer.

**Fix:** Unexport; module-local factory.

---

### 9. ~~`drawCachedPropSprite` — `modifier` opt never used~~ ✅

Removed with positional API — `modifier` override never had callers.

---

### 10. `getConveyorSpriteCacheKey` — dead export

**Where:** `Libraries/Render/conveyorDraw.js`

**What:** Returns `` `f${animFrame}` ``. Zero importers. Belt animation uses `animFrame` arg on `drawCachedPropSprite` + proxy `getCustomSpriteCacheKey` in `gridStampDrawCache.js` instead.

**Why it's bullshit:** Leftover from before grid stamp cache; comment still implies it’s the belt key path.

**Fix:** Delete function + export.

---

### 11. `setPropRecipes` — dead mutators on two classes

**Where:** `PropRenderer.setPropRecipes`, `WorldSceneRenderer.setPropRecipes`

**What:** Recipes injected once via `WorldSceneRenderer` constructor (`Render/Render.js`). No call sites for either setter.

**Fix:** Delete both methods.

---

## Tier 2 — Overlay commands

### 12. `overlayDirectionArrow` — dead uncached twin

**Where:** `Libraries/Render/overlays/overlayCommands.js`

**What:** Uncached arrow builder. Zero importers. Product uses `overlayCachedFlowDirectionArrow` from `pathOverlayCommands.js`.

**Why it's bullshit:** Live/cached pair where only cached side shipped.

**Fix:** Delete.

---

### 13. `overlayCachedAabb` — exported, one caller in same file

**Where:** `overlayCommands.js`

**What:** Generic cached-AABB factory. Only caller: `overlayGridCellHighlight` in the same file. External code imports `overlayGridCellHighlight` only.

**Fix:** Inline into `overlayGridCellHighlight` or make module-private.

---

### 14. `overlayWireLink` vs `appendOverlayWireLink`

**Where:** `overlayCommands.js`

**What:** `appendOverlayWireLink` = `out.push(...overlayWireLink(...))`. All external sites import `appendOverlayWireLink` only. `overlayWireLink` is never imported outside the file (rules mention it as API, nothing calls it directly).

**Fix:** One export — either merge into `appendOverlayWireLink` or make `overlayWireLink` private.

---

### 15. `drawCachedOverlayCommand` — private hop in one file

**Where:** `Libraries/Render/overlays/drawOverlayCommands.js`

**What:** Resolves anchor → calls `drawCachedOverlayGlyph` with bake closure. Single caller: cached branch of `drawOverlayCommands` loop.

**Why it's bullshit:** Extra layer inside a file that already owns both sides. Low severity (not exported).

**Fix:** Inline into the `cmd.cache` branch.

---

## Tier 3 — WorldSurface / chunks

### 16. `projectHorizontalSurfaceCornersInto` — one-line forward, zero calls

**Where:** `Libraries/WorldSurface/ChunkDrawPass.js`, re-exported from `HorizontalSurfaceDraw.js`

**What:** Forwards to `projectWorldAabbCornersInto` for a square AABB. **Zero call sites.** `drawProjectedHorizontalChunkAt` projects inline instead.

**Fix:** Delete function; drop from re-export line.

---

### 17. `clipChunkToBlockedCells` / `clipChunkToStaticEdgeRails` — dead clip variants

**Where:** `ChunkDrawPass.js`, re-exported from `HorizontalSurfaceDraw.js`

**What:** Clip helpers exported alongside `clipChunkToFlatWallFootprints`. Only flat-wall clip is imported (`WorldSurfaceEngine.js`). Other two: zero call sites.

**Why it's bullshit:** Clip-variant zoo kept for imagined parity; two are orphan.

**Fix:** Delete both; trim re-export barrel.

---

### 18. `HorizontalSurfaceDraw.js` ChunkDrawPass re-export line — unused symbols

**Where:** `Libraries/WorldSurface/HorizontalSurfaceDraw.js` line 5

**What:** Re-exports four `ChunkDrawPass` symbols. Engine imports `chunkHasBlockedCells` / roof mask from `HorizontalSurfaceDraw`, imports `clipChunkToFlatWallFootprints` **directly** from `ChunkDrawPass.js`. Nobody imports the re-exported clip/projection symbols.

**Fix:** Remove re-export line; import `ChunkDrawPass` only where needed.

---

### 19. `drawProjectedHorizontalChunk` + `drawProjectedHorizontalChunkAt` — duplicated blit

**Where:** `Libraries/WorldSurface/WorldSurfaceResolution.js`

**What:** Both guard + `drawImageQuad`. `At` projects corners then blits; non-`At` blits pre-projected corners. **`At` does not call** `drawProjectedHorizontalChunk` — copy-pasted core. Both take `settings`; neither reads it (`drawBakedTexture` same — `_settings` ignored).

**Why it's bullshit:** Two names for one blit with projection optional; dead param carried on every chunk draw from engine + animated surfaces.

**Fix:** `At` projects into scratch corners then calls `drawProjectedHorizontalChunk`; drop unused `settings` params (or wire them for real).

---

### 20. `getSurfaceBakeScale` — property passthrough

**Where:** `WorldSurfaceResolution.js` — `return settings.surfaceBakeScale`

**What:** One-line accessor used in 5+ places.

**Why it's bullshit:** Not wrong, but it’s a name for a field read. Lower priority than dead exports.

**Fix:** Inline at call sites if you want fewer hops; optional.

---

## Tier 4 — Floor / sandbox layering

### 21. `drawFloorOccupancyBelts` / `drawFloorOccupancyPowerSources` — orchestration wrappers

**Where:** `Libraries/Sandbox/floorOccupancy.js` → `gridStampDrawCache.js`

**What:** Grid guard → `syncFloorOccupancyStampDrawCache` → `drawCachedFloorOccupancy*`. Sole caller: `WorldSceneRenderer.drawFloorProps`. ~~`{ px, py }` camera object on the chain~~ — fixed; scalars now.

**Why it's bullshit:** Outer layer only adds early returns; no other consumers. Real draw lives one hop away.

**Fix:** Merge guards into `gridStampDrawCache` entry points or call gridStampDrawCache directly from WorldSceneRenderer.

---

### 22. Dead import `bumpFloorOccupancyStampDrawRevision`

**Where:** `Libraries/Sandbox/gridStampDrawCache.js` imports it; never used in file.

**Why it's bullshit:** Leftover from when bump lived here; bump moved to grid sync paths.

**Fix:** Remove import.

---

## Tier 5 — Orphan barrels / files

### 23. `Libraries/Sandbox/index.js` — import-only file, no exports, no importers

**Where:** 48 lines of imports from sandbox modules. **No exports. Nothing imports this file.**

**Why it's bullshit:** Looks like an unfinished public API catalog. Side-effect-free stub that nothing loads.

**Fix:** Delete file.

---

### 24. `Libraries/Canvas/index.js` — bloated barrel, one symbol used

**Where:** Re-exports `applySquareCanvasResize` + ~20 `CanvasPath` symbols.

**What:** Only `applySquareCanvasResize` is imported via this barrel (3 editor UI files). Everything else imports `CanvasPath.js` directly.

**Fix:** Shrink to `applySquareCanvasResize` only, or import `squareCanvasResize.js` directly and delete barrel.

---

### 25. `Libraries/Motion/index.js` — single-function passthrough barrel

**Where:** `export { applyVelocityDamping } from "./applyDamping.js"`

**What:** Two importers (`WorldProp.js`, `propMotion.js`).

**Fix:** Import `applyDamping.js` directly; delete barrel.

---

## Fix order (suggested)

**Done:** Tier 1 #1–#4, floor `{ px, py }` scalars, positional `drawCachedPropSprite`.

**Next (recommended): dead exports batch** — #7, #10, #11, #12, #16, #17, #23. Pure deletes, no behavior change, clears grep noise in ~15 minutes.

**Then pick one thread:**

| Thread | Items | Why |
|--------|-------|-----|
| **Render tidy** | #6, #3, #5 | Unexport bake helpers, prop key pack inline |
| **WorldSurface** | #18, #19 | Orphan clip/projection + duplicated chunk blit |
| **Floor layer** | #21 remainder | Collapse `floorOccupancy` guards into `gridStampDrawCache` |

1. ~~**Render path collapse** — #1, #2~~ ✅
2. **Dead exports** — #7, #8, #10, #11, #12, #16, #17, #23
3. **Same-file inlines** — #3, #5, #13, #14, #15, #22
4. **Render tidy** — #6
5. **WorldSurface clip/projection cleanup** — #18, #19
6. **Floor wrapper merge** — #21
7. **Barrel trim** — #24, #25

---

## Explicitly not indirection (don’t waste time)

| Item | Why it stays |
|------|----------------|
| `drawCachedPropSprite` / `drawCachedOverlayGlyph` | Mandated public draw entry; real external callers |
| `appendOverlayWireLink` | 4+ external call sites |
| `internSpriteKeyPart` / `packQuantizedViewBucket` | Private helpers, multi-use inside cache module |
| `syncFloorOccupancyStampDrawCache` | Real revision cache; amortizes sync cost |
| `Pathfinding/index.js`, `Props/primitives/index.js` | Actual package boundaries with consumers |
| `projectWorldAabbCornersInto` / `chunkWorldAabbScratch` | Real scratch API, not passthrough naming |
