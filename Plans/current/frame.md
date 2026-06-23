# Frame draw pass — `WorldSceneDrawPass`

Render’s **AABB moment**: one engine-owned struct per frame for camera + shared draw wiring, instead of re-reading `viewport.x/y/zoom` and threading `px, py, zoom` through every blit.

**Sibling docs:** implementation detail for sprite APIs → `Plans/clean.md` (if present) · perf lens → [`objects.md`](objects.md) #3 · other big wins → [`gamechangers.md`](gamechangers.md)

**Done (pre-pass):** draw recipes live on exported **`worldPropRecipes`** (`PropCatalog.js`) — imported at bake/draw sites, not threaded, no getter.

---

## Problem

Today there are **two parallel “context” concepts**:

| Struct | Owner | Carries | Missing |
|--------|-------|---------|---------|
| **`WorldSceneDrawInput`** | `Renderer.worldSceneDrawInput` | entities, spatial frame, surfaces, grid, gameState | camera |
| **`wallCtx` + `wallPassCamera`** | `WorldSceneRenderer` | elevation camera, atlas, damage, bounds | everything else |

Every draw entry re-derives camera from viewport:

```text
drawDebrisProps / drawFloorProps / draw3DBuildings
  → const px = viewport.x; const py = viewport.y; const zoom = viewport.zoom ?? 1
  → drawCachedPropSprite(ctx, prop, px, py, …)
  → drawFloorOccupancy*(ctx, state, viewport, px, py)
  → elevationCameraFromViewportInto(wallPassCamera, viewport)
```

**Symptoms:**

- 4+ parameters on every prop/grid-stamp blit (`px`, `py`, `zoom`).
- Wall draw uses a **15-field bag** mutated per drawable (`_bindWallDrawable`) while props use loose scalars.
- `resolveSpriteDrawModifier` still conceptually wants viewport-relative offsets; no single place owns “frame camera”.
- New draw features copy the `viewport.x` extraction pattern instead of one dialect.

This is the same class of mess bounds were in before `*Into` scratch — not wrong per call site, but **no shared frame contract**.

---

## Target

### `WorldSceneDrawPass` — filled once per sub-pass, reused for all blits

Plain mutable object owned by `WorldSceneRenderer` (or `Renderer`), **not** passed as `{ opts }` to hot leaf functions. Fields written once; leaves read fields.

```javascript
// Libraries/Render/WorldSceneDrawPass.js (new) — module-level @typedef only

/**
 * @typedef {Object} WorldSceneDrawPass
 * @property {number} px
 * @property {number} py
 * @property {number} zoom
 * @property {import("../Spatial/iso/ElevationCamera.js").ElevationCamera} camera
 * @property {import("../Viewport/Viewport.js").Viewport} viewport  // tier queries only; not for px/py re-read
 */
```

**Fill site (one place per draw method):**

```javascript
_beginDrawPass(pass, viewport) {
    pass.px = viewport.x;
    pass.py = viewport.y;
    pass.zoom = viewport.zoom ?? 1;
    pass.viewport = viewport;
    elevationCameraFromViewportInto(pass.camera, viewport);
}
```

Use a **stable `pass.camera` object** (like today’s `wallPassCamera`) — `Into` writes fields, never replaces the object.

### Public draw API shape (after migration)

**Keep** `WorldSceneDrawInput` for **scene data** (entities, grid, surfaces).  
**Add** `drawPass` for **camera** on draw calls. Prop draw recipes: **`import { worldPropRecipes } from PropCatalog.js`** at lookup sites only.

```text
// Scene renderer entry points
drawFloorProps(ctx, input, drawPass)
draw3DBuildings(ctx, input, drawPass, options?)
drawDebrisProps(ctx, input, drawPass)

// Prop pipeline
PropRenderer.drawProp(ctx, prop, drawPass, animFrame?)
drawCachedPropSprite(ctx, prop, drawPass, renderKey, draw, animFrame?)

// Grid stamps (viewport still needed for tier cull)
drawFloorOccupancyBelts(ctx, state, drawPass)
drawCachedPropSprite(ctx, proxy, drawPass, renderKey, draw, animFrame?)

// Overlays (editor)
drawOverlayCommands(ctx, commands, drawPass)

// Walls — collapse wallCtx frame fields into drawPass + per-drawable scratch
drawProjectedWallFace(ctx, p1, p2, drawPass, drawableScratch)
```

**Rule:** leaf recipes stay `(ctx, prop, px, py)` **only if** `px/py` are read from `drawPass` at the **single** `drawCachedPropSprite` boundary — recipes do not take `drawPass` unless they need zoom/line scale (most don’t).

**Not in scope:** `{ drawPass, … }` opts objects on hot paths. Positional `drawPass` reference + entity args only.

---

## Relationship to `Plans/clean.md`

| clean.md goal | frame.md delivers |
|---------------|-------------------|
| `drawCachedPropSprite(ctx, drawPass, …)` | ✅ pass owns `px, py, zoom` |
| Stop repeating camera at every call site | ✅ |
| Modifier / view quantize uses pass-relative coords | ✅ prerequisite — read `pass.px/py` inside cache |
| Packed numeric cache keys (pass 2) | **Separate follow-up** inside `QuantizedSpriteCache.js` — can land after pass exists |

Do **frame pass first** (API normalization). **Sprite key packing second** (perf), unless you want both in one branch.

---

## Architecture (before → after)

```text
BEFORE
  Renderer.syncWorldSceneDrawInput(state)  → input (no camera)
  WorldSceneRenderer.draw*(ctx, input, viewport)
    → viewport.x/y/zoom × N
    → wallCtx ← 15 fields + wallPassCamera

AFTER
  Renderer.syncWorldSceneDrawInput(state)  → input (unchanged)
  WorldSceneRenderer.draw*(ctx, input, viewport)
    → _beginDrawPass(this.drawPass, viewport)   // once
    → all children read this.drawPass
    → wall draw: pass.camera + small per-face scratch (height, cacheObj, atlasFaceId)
```

**Optional later:** `Renderer.beginWorldSceneDraw(viewport)` fills pass once for backdrop + structure + editor overlay in same frame. Start with **per `WorldSceneRenderer` method** fill — lower risk.

---

## Migration phases

### Phase 0 — Introduce pass object (no caller changes)

- [ ] Add `WorldSceneDrawPass.js` typedef + `WorldSceneRenderer.drawPass` field `{ px, py, zoom, viewport, camera }`.
- [ ] `_beginDrawPass(pass, viewport)` helper on renderer.

### Phase 1 — Scene renderer internal

- [ ] `drawDebrisProps`, `drawFloorProps`, `draw3DBuildings`: call `_beginDrawPass` once; stop local `px/py/zoom` except via `pass`.
- [ ] Pass `pass` to `drawFloorOccupancy*`, `collectForcefieldEdgeDrawables`, `drawForcefieldEdgeProp`.
- [ ] `PropRenderer.drawProp(ctx, prop, pass, animFrame)`.

### Phase 2 — Cache layer

- [ ] `drawCachedPropSprite(ctx, prop, pass, renderKey, draw, animFrame?)` — reads `pass.px`, `pass.py`, `pass.zoom` internally.
- [ ] `drawCachedOverlayGlyph(ctx, worldX, worldY, pass, …)` — same.
- [ ] `resolveSpriteDrawModifier(prop, pass.px, pass.py)` — already scalar; no `{ x, y }` object (plan.md #3).

### Phase 3 — Wall context collapse

- [ ] Move **frame-stable** `wallCtx` fields onto `drawPass` or a slim `WallFaceDrawScratch` mutated per face:
  - **On pass (set once per `draw3DBuildings`):** `viewport`, `worldSurfaces`, `proceduralSurfaceDraw`, `gameState`, `fillStyle`, `worldBounds`, `camera`, `skipWallCaps`
  - **Per drawable (reuse one scratch object):** `wallHeight`, `wallBaseZ`, `wallCapHeight`, `cacheObj`, `atlasFaceId`, `damageTintRatio`
- [ ] Delete redundant `wallPassCamera` if `pass.camera` is the same object.
- [ ] Update `ProjectedWallDraw.js`, `StaticGridWallDraw.js`, `StaticGridEdgeRailDraw.js` signatures.

### Phase 4 — Editor overlay + misc

- [ ] `preview.js`: build pass once per overlay z-index (or share renderer’s pass).
- [ ] `drawOverlayCommands(ctx, commands, pass)`.
- [ ] `animatedSurfaceDraw` / `losShadowOverlay`: use `pass.camera` or module scratch filled from pass (folds [`normalization.md`](normalization.md) #6).

### Phase 5 — Cleanup

- [ ] Remove dead `px, py, zoom` parameters from migrated exports.
- [ ] Update `WorldSceneTypes.js` — document `drawPass` alongside `WorldSceneDrawInput`.
- [ ] Update `.cursor/rules/rendering-pipelines.mdc` examples.
- [ ] Mark [`objects.md`](objects.md) #3 done when modifier path is pass-relative.

---

## File checklist

| File | Change |
|------|--------|
| `Libraries/Render/WorldSceneDrawPass.js` | **New** — `@typedef` only |
| `Libraries/Render/WorldSceneRenderer.js` | Own `drawPass`, `_beginDrawPass`, migrate all draw methods |
| `Libraries/Render/Props3D/PropRenderer.js` | `drawProp(ctx, prop, pass, animFrame?)` |
| `Libraries/Canvas/QuantizedSpriteCache.js` | `drawCachedPropSprite/Glyph` take `pass` |
| `Libraries/Render/spriteDrawModifier.js` | Confirm scalar `px, py` from pass |
| `Libraries/Sandbox/gridStampDrawCache.js` | `drawFloorOccupancy*(ctx, state, pass)` |
| `Libraries/Sandbox/drawForcefields.js` | collect + draw use `pass` |
| `Libraries/Render/overlays/drawOverlayCommands.js` | `drawOverlayCommands(ctx, commands, pass)` |
| `Libraries/Render/Structure3D/WallDrawContext.js` | Slim typedef; split frame vs per-face scratch |
| `Libraries/Render/Structure3D/ProjectedWallDraw.js` | Read from pass + face scratch |
| `Libraries/Render/Structure3D/StaticGridWallDraw.js` | Collect uses `pass.px/py` |
| `Libraries/Render/Structure3D/StaticGridEdgeRailDraw.js` | Same |
| `Render/StructureDrawPass.js` | No change if renderer methods own pass fill |
| `Render/Render.js` | Optional: shared pass across backdrop + structure |
| `Apps/Editor/ui/preview.js` | Overlay draw uses pass |
| `Libraries/WorldSurface/WorldSurfaceEngine.js` | `groundChunkPassCamera` → `pass.camera` if same frame (optional) |

**Touch count:** ~15–20 files. **Behavior change:** none if pass mirrors current viewport reads.

---

## Explicit non-goals

- **Merged depth sort** — see [`gamechangers.md`](gamechangers.md) G7; easier after pass exists.
- **Sprite cache BigInt key packing** — `Plans/clean.md` pass 2; separate PR.
- **Opts objects** on `drawCached*` — rejected; pass is a named struct, not a per-call literal.
- **Replacing `WorldSceneDrawInput`** — input stays for scene wiring; pass is camera-only.
- **Entity `render(ctx, renderer, state)`** — legacy hook; out of scope unless unified later.

---

## Review bar

- [ ] No new draw feature reads `viewport.x` in a leaf module — only `_beginDrawPass`.
- [ ] `drawCachedPropSprite` has **one** place that reads `pass.px/py/zoom`.
- [ ] Wall draw no longer carries 15 frame-stable fields on a object mutated across the whole pass **and** separate camera object.
- [ ] `Plans/clean.md` signature targets match shipped API.
- [ ] Rendering rules cite `drawPass`, not scattered scalars.

---

## Suggested landing strategy

1. **Phase 0–1** in one PR — renderer + prop path; behavior-identical.
2. **Phase 2** — cache signatures; update all call sites in same PR (compiler/grep driven).
3. **Phase 3** — wall ctx collapse; highest careful-read diff.
4. **Phase 4–5** — editor + docs.

Run import smoke on touched modules; no full test suite required unless cache signatures break tests that import draw APIs directly.
