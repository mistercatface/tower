# Frame — viewport only

**Goal:** `Viewport` is the only draw-frame handle. Delete every copy of its data (`ElevationCamera`, `wallPassCamera`, `px`/`py`/`zoom` params, resolver functions, side-channel bindings).

**Sibling docs:** sprite key packing → `Plans/clean.md` · perf → [`objects.md`](objects.md) #3 · G1 done → [`gamechangers.md`](gamechangers.md)

**Prerequisites (done):** `worldPropRecipes` static import · G1 forcefields in `gridStampDrawCache.js`

---

## The rule

```text
Pass viewport. Read viewport. Nothing else.
```

| Need | Read from |
|------|-----------|
| Viewer position | `viewport.x`, `viewport.y` |
| Zoom | `viewport.zoom ?? 1` |
| Tier cull / screen map | `viewport` methods |
| Iso frustum height | `viewport.cameraHeight` |
| Iso extrusion strength | `viewport.perspectiveStrength` |
| Scene (entities, grid, surfaces) | `input` or `state` — **not** viewport |

**No second struct.** No unpacking `viewport` into locals at every draw entry. No threading the same three scalars alongside viewport.

---

## Forbidden (do not ship any of this)

| Banned | Why |
|--------|-----|
| **`ElevationCamera` / `elevationCameraFrom*`** | Copy of `viewport.x/y` + two config numbers |
| **`wallPassCamera`, `wallCtx.camera`** | Same copy, wall-only |
| **`WorldSceneDrawPass { px, py, zoom, camera }`** | Duplicate viewport |
| **`const px = viewport.x` in every draw method** | Pass viewport; unpack once at the boundary |
| **`drawCachedPropSprite(…, px, py, …, zoom)`** | Pass viewport; unpack inside |
| **`resolveStructurePerspectiveStrength` / `resolvePerspectiveForViewport`** | Resolver theater — fields live on viewport |
| **`activePerspective` read in draw/projection** | Boot writes viewport once; hot path never touches it |
| **`Viewport.bindDrawSession()` or any draw side-channel** | Recipes get `px/py` from the cache boundary, not a global bind |
| **Half-updated signatures** | Change `drawCachedPropSprite` + **every caller in the same PR** |

---

## Viewport fields to add

On **`Libraries/Viewport/Viewport.js`**:

| Field | Set when | Used by |
|-------|----------|---------|
| `cameraHeight` | boot / config change (`installEditorDefaults`) | iso alpha, wall band clip |
| `_perspectiveStrengthBase` | boot / config change (private; session config strength) | input to `_recompute` only |
| `perspectiveStrength` | **`_recompute()` only** | iso alpha (zoom-scaled) |

Delete: `structurePerspectiveStrength`, `_structurePerspectiveConfigGen`, `resolveStructurePerspectiveStrength`, `perspectiveConfigGeneration` cache.

**`_recompute()`** (already on pan/zoom/resize):

```javascript
const worldSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(this.halfW, this.halfH) * 2);
const referenceSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, this.getVisualRadius() * 2);
this.perspectiveStrength = (this._perspectiveStrengthBase * referenceSpan) / worldSpan;
```

Boot (`engineGlobals.installEditorDefaults`):

```javascript
state.viewport.cameraHeight = perspective.cameraHeight;
state.viewport._perspectiveStrengthBase = perspective.strength;
state.viewport._recompute();
```

Only **`perspectiveStrength`** is read outside `Viewport`. The base is config input, not a draw-path concept.

---

## Target signatures

### Draw stack — viewport in, no scalar copies out

```text
drawDebrisProps(ctx, input, viewport)
drawFloorProps(ctx, input, viewport)
draw3DBuildings(ctx, input, viewport, options?)
drawFloorOccupancyBelts(ctx, state, viewport)
drawOverlayCommands(ctx, commands, viewport)
drawProjectedWallFace(ctx, p1, p2, viewport, input, wallFaceScratch)
```

### Cache boundary — one unpack site

```javascript
export function drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame = 0) {
    const px = viewport.x;
    const py = viewport.y;
    const zoom = viewport.zoom ?? 1;
    const sprite = getOrBakePropSprite(prop, viewport, renderKey, draw, animFrame, zoom);
    const modifier = resolveSpriteDrawModifier(prop, px, py);
    blitAnchoredSprite(ctx, sprite, prop.x, prop.y, modifier);
}
```

`getOrBakePropSprite` passes **`viewport`** into bake; recipes still **`(ctx, prop, px, py)`** — cache unpacks `viewport.x/y` before calling `draw()`.

Same pattern for `drawCachedOverlayGlyph`.

### Projection — viewport in, no camera struct

```javascript
export function resolveElevationAlpha(height, viewport) {
    if (height <= 0 || viewport.cameraHeight <= height) return 0;
    return (height / (viewport.cameraHeight - height)) * viewport.perspectiveStrength;
}

export function projectWorldPointInto(out, worldX, worldY, height, viewport) {
    const alpha = resolveElevationAlpha(height, viewport);
    if (alpha <= 0) {
        out.x = worldX;
        out.y = worldY;
    } else {
        out.x = worldX + (worldX - viewport.x) * alpha;
        out.y = worldY + (worldY - viewport.y) * alpha;
    }
    return out;
}
```

```javascript
export function projectPropVertexInto(out, prop, viewport, lx, ly, lz) {
    // ground: wx/wy direct; elevated: projectWorldPointInto(..., viewport)
}
```

Delete **`ElevationCamera.js`** factories. Tests (`losShadowHarness`) stub a **`Viewport`** or plain object with the same fields — not a parallel camera type.

---

## wallCtx collapse

**Delete** the 15-field frame bag. Wall draw becomes:

```text
viewport     — camera + cull (already has everything wall projection needs)
input        — worldSurfaces, proceduralSurfaceDraw, gameState
wallFaceScratch — reused per face: wallHeight, wallBaseZ, wallCapHeight, cacheObj, atlasFaceId, damageTintRatio
```

Delete: `wallPassCamera`, `_bindWallDrawable` copying into a mega-context, `wallCtx.camera`, `elevationCameraFromViewportInto`.

---

## Migration — one coherent pass, not file-by-file hacks

### Step 1 — Viewport + boot (behavior-neutral for draw if old paths still read globals briefly)

- [x] Add `cameraHeight`, `_perspectiveStrengthBase`, `perspectiveStrength` to `Viewport`
- [x] Compute `perspectiveStrength` in `_recompute()`; delete resolver/cache on viewport
- [x] `installEditorDefaults` writes `state.viewport`; delete `activePerspective` hot-path reads
- [x] Trim `GamePerspective.js` to boot helpers only (`resolvePerspectiveConfig`, defaults)

**Step 1 note:** prop recipes `(ctx, prop, viewport)`. Bake uses `ctx.translate` + world `stageProp` coords; projection reads `viewport` only. No `_drawViewport` side channel.

### Step 2 — Projection + walls (delete camera copies)

- [ ] `IsometricProjection`, `propMesh`, `ProjectedWallDraw`, ground/animated surface: take **`viewport`**, not `ElevationCamera`
- [ ] Delete `elevationCameraFrom*`, `wallPassCamera`, `sStructureRoofCamera`
- [ ] Unify prop + wall strength → always `viewport.perspectiveStrength`

### Step 3 — Cache + all callers (single PR — do not split)

- [ ] `drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame?)`
- [ ] `drawCachedOverlayGlyph(…, viewport, …)`
- [ ] Update **every** caller same commit:
  - `WorldSceneRenderer`
  - `gridStampDrawCache.js`
  - `preview.js` / overlay draw
- [ ] Remove all `const px = viewport.x` at draw entry points except inside cache/unpack helpers
- [ ] Grep gate: zero `drawCachedPropSprite(.*, px, py` at call sites

### Step 4 — wallCtx + renderer cleanup

- [ ] Wall draw → `(viewport, input, wallFaceScratch)`; slim or delete `WallDrawContext.js` typedef
- [ ] Inline `createStructureDrawPass` (stupid.js P2-3)
- [ ] `WorldSceneRenderer` drops settings ctor param → static import (P2-6)
- [ ] Optional later: collapse `worldSceneDrawInput` → `draw*(ctx, state, viewport)`

---

## File checklist

| File | Change |
|------|--------|
| `Libraries/Viewport/Viewport.js` | iso fields + `_recompute` strength |
| `Core/engineGlobals.js` | boot → `state.viewport` |
| `Core/GamePerspective.js` | boot config only; delete resolver |
| `Libraries/Spatial/iso/ElevationCamera.js` | **delete** |
| `Libraries/Spatial/iso/IsometricProjection.js` | `viewport` param |
| `Libraries/Render/Props3D/propMesh.js` | `viewport` param |
| `Libraries/Canvas/QuantizedSpriteCache.js` | `viewport` on draw + bake |
| `Libraries/Render/WorldSceneRenderer.js` | viewport-only entry; no local px/py/zoom |
| `Libraries/Sandbox/gridStampDrawCache.js` | viewport-only |
| `Libraries/Render/overlays/drawOverlayCommands.js` | viewport |
| `Libraries/Render/Structure3D/*` | viewport + scratch; no wallCtx camera |
| `Render/StructureDrawPass.js` | delete roof camera fill |
| `Apps/Editor/ui/preview.js` | viewport on overlay draw |

---

## Review bar

- [ ] Draw/projection imports **`Viewport`**, not `GamePerspective` / `ElevationCamera`
- [ ] Zero `elevationCameraFrom`, `wallPassCamera`, `activePerspective`, `resolveStructurePerspectiveStrength`
- [ ] Zero `drawCachedPropSprite` call sites passing `px, py` as args
- [ ] Zero `const px = viewport.x` in `WorldSceneRenderer` draw methods (only inside cache)
- [ ] Zero `bindDrawSession` / draw side-channels
- [ ] `perspectiveStrength` written only in `Viewport._recompute()`

---

## Verify after ship

```text
rg elevationCameraFrom Libraries Render
rg wallPassCamera
rg bindDrawSession
rg resolveStructurePerspectiveStrength
rg 'activePerspective' Libraries/Render Libraries/Spatial/iso Render
rg 'const px = viewport\.x' Libraries/Render Render
rg 'drawCachedPropSprite\([^)]*,\s*[^,]+,\s*[^v]'
```

---

## Non-goals

- Merged depth sort (G7) — after frame lands
- Sprite cache BigInt keys (`Plans/clean.md`) — separate PR
- `{ opts }` bags on hot draw paths
- Per-prop perspective overrides (none exist)
