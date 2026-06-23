# Frame draw pass — viewport only

Render’s **AABB moment**: **`Viewport` is the only frame handle** — pan, zoom, cull, screen mapping, iso elevation knobs. **No parallel camera structs, no scalar copies, no resolver functions in the hot path.**

**Sibling docs:** sprite key packing → `Plans/clean.md` (if present) · perf → [`objects.md`](objects.md) #3 · other wins → [`gamechangers.md`](gamechangers.md)

**Done (prerequisites):**

- **`worldPropRecipes`** — static import at lookup sites; no threading, no `PropRenderer`.
- **G1** — forcefield grid stamps in `gridStampDrawCache.js` (stable proto proxies).

---

## Principle

```text
viewport  = x, y, zoom, cameraHeight, perspectiveStrength, cull tiers, worldToScreen
input     = entities, grid, surfaces, gameState
scratch   = one reused object for per-face mutation (wall band, atlasFaceId, …)
```

**Everything that varies with “how we’re looking at the world” lives on `viewport`.** Projection reads **`viewport` fields only** — not `activePerspective`, not `resolveStructurePerspectiveStrength`, not `resolvePerspectiveForViewport`, not `ElevationCamera`.

**Boot-only:** `gameDefinition.perspective` → merge into **`viewport.cameraHeight`** + base strength inputs when perspective config changes. After that, draw code never touches globals.

**No props override perspective.** Zero assets, zero `strategy.*` overrides.

---

## Stupid shit today (kill all of it)

| Stupid | Fix |
|--------|-----|
| **`const px = viewport.x`** × N | Pass **`viewport`**; unpack once at cache/recipe boundary |
| **`drawCachedPropSprite(…, px, py, …, zoom)`** | **`drawCachedPropSprite(…, viewport, …)`** |
| **`elevationCameraFrom*`** | Delete — projection uses **`viewport`** |
| **`wallPassCamera` / `wallCtx.camera`** | Delete |
| **`wallCtx` 15-field bag** | **`viewport` + `input` + `wallFaceScratch`** |
| **`activePerspective` read in draw/projection** | Write into **`viewport` at boot + on `_recompute`**; never read in hot path |
| **`resolveStructurePerspectiveStrength(viewport)`** | Delete — **`viewport.perspectiveStrength`** computed in **`Viewport._recompute()`** |
| **`resolvePerspectiveForViewport(viewport)`** (old plan) | **Never add this** — fields on viewport |
| **Prop vs wall strength split** | One **`viewport.perspectiveStrength`** for everything |
| **`structurePerspectiveStrength`** (orphan name) | Rename → **`perspectiveStrength`** on viewport |
| **`WorldSceneDrawPass` / `{ px, py, zoom, camera }`** | Rejected |
| **`worldSceneDrawInput` + sync** | Optional later collapse → `draw*(ctx, state, viewport)` |

---

## Viewport fields (after migration)

Add to **`Libraries/Viewport/Viewport.js`**:

| Field | When set | Used for |
|-------|-----------|----------|
| `x`, `y`, `zoom` | pan/zoom (existing) | cull, screen mapping, viewer position for iso |
| **`cameraHeight`** | perspective config change (boot / editor defaults) | iso frustum cap, wall band clipping |
| **`perspectiveStrength`** | **`_recompute()`** (pan, zoom, canvas resize, perspective config bump) | iso extrusion alpha — zoom-scaled |

**`_recompute()`** (already runs on pan/zoom/resize) becomes the **only** place that derives `perspectiveStrength`:

```javascript
_recompute() {
    // … existing halfW, halfH, viewBounds …
    const worldSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, Math.min(this.halfW, this.halfH) * 2);
    const referenceSpan = Math.max(LIBRARY_MIN_WORLD_SPAN, this.getVisualRadius() * 2);
    this.perspectiveStrength = (this._perspectiveIntensity * referenceSpan) / worldSpan;
}
```

**`cameraHeight`** + **`_perspectiveIntensity`** (base strength from session config) are copied onto the viewport when `installEditorDefaults` / perspective bump runs — then `_recompute()` refreshes `perspectiveStrength`.

Delete **`structurePerspectiveStrength`**, **`_structurePerspectiveConfigGen`**, **`resolveStructurePerspectiveStrength`**, generation-counter cache theater — `_recompute()` already invalidates on zoom/pan.

---

## Projection API

**No helper that “resolves” perspective from viewport.** Read fields.

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

That's it. **`projectPropVertexInto(out, prop, viewport, lx, ly, lz)`** calls the same path — no `px/py`, no `sPropCamera`, no `elevationCameraFromViewer`.

**Delete:** `ElevationCamera.js` factories, all `elevationCameraFrom*`, carried `camera` params on wall/ground draw.

**Tests:** `losShadowHarness.makeTestCamera` → set fields on a test **`Viewport`** (or plain `{ x, y, zoom, cameraHeight, perspectiveStrength }` stub), not a parallel camera type.

---

## Target architecture

```text
installEditorDefaults / perspective bump
  → viewport.cameraHeight = …
  → viewport._perspectiveIntensity = …
  → viewport._recompute()   // fills perspectiveStrength

renderSimulationScene(state, viewport)
  viewport.apply(ctx)
  draw*(ctx, input, viewport)
    drawCachedPropSprite(ctx, prop, viewport, …)
    projectWorldPointInto(out, wx, wy, h, viewport)
    drawProjectedWallFace(ctx, p1, p2, viewport, input, wallFaceScratch)
```

---

## Who owns what

| Concern | Owner |
|---------|--------|
| Pan, zoom, screen mapping | **`viewport.x/y/zoom`** |
| Iso frustum height | **`viewport.cameraHeight`** |
| Iso extrusion strength | **`viewport.perspectiveStrength`** |
| Entities, grid, surfaces | **`input`** / **`state`** |
| Belt anim | **`state.gameTime`** |
| Line width in recipes | **`getCanvasLineScale(ctx)`** (canvas transform) |
| Per-wall face band, atlas, damage | **`wallFaceScratch`** |

---

## Public draw API

```text
drawDebrisProps(ctx, input, viewport)
drawFloorProps(ctx, input, viewport)
draw3DBuildings(ctx, input, viewport, options?)
drawCachedPropSprite(ctx, prop, viewport, renderKey, draw, animFrame?)
drawCachedOverlayGlyph(ctx, worldX, worldY, viewport, …)
drawFloorOccupancyBelts(ctx, state, viewport)
drawOverlayCommands(ctx, commands, viewport)
drawProjectedWallFace(ctx, p1, p2, viewport, input, wallFaceScratch)
```

Recipes stay **`(ctx, prop, px, py)`** — `drawCachedPropSprite` unpacks **`viewport.x/y` once** for the recipe only.

---

## Migration phases

### Phase 0 — Viewport owns iso fields

- [ ] Add **`cameraHeight`**, **`_perspectiveIntensity`**, **`perspectiveStrength`** to `Viewport`.
- [ ] Compute **`perspectiveStrength`** in **`_recompute()`**; delete **`structurePerspectiveStrength`** + **`resolveStructurePerspectiveStrength`**.
- [ ] **`installEditorDefaults`**: after merging perspective config, write **`state.viewport.cameraHeight`** + **`_perspectiveIntensity`**, call **`_recompute()`**.
- [ ] Grep: no **`activePerspective`** reads under `Libraries/Render`, `Libraries/Spatial/iso`, `Render` draw paths.

### Phase 1 — Projection reads viewport fields only

- [ ] `IsometricProjection` + `propMesh` — **`viewport`** param; delete **`ElevationCamera`** from render path.
- [ ] Update wall/ground/animated surface call sites.

### Phase 2 — Cache boundary takes viewport

- [ ] `drawCachedPropSprite/Glyph`, `drawOverlayCommands`, `gridStampDrawCache`, `WorldSceneRenderer`, `preview.js`.

### Phase 3 — Kill wallCtx frame bag

- [ ] Delete **`wallPassCamera`**, **`wallCtx.camera`**, frame-stable **`wallCtx`** fields → **`input` + viewport + scratch**.

### Phase 4 — Renderer cleanup

- [ ] Inline **`createStructureDrawPass`**; drop **`WorldSceneRenderer(settings)`** ctor; optional **`worldSceneDrawInput`** collapse.

### Phase 5 — Delete dead API

- [ ] Remove **`ElevationCamera.js`** (or test stub only).
- [ ] Remove **`activePerspective`** from any file that isn't boot/config.
- [ ] Grep gates below.

---

## File checklist

| File | Change |
|------|--------|
| **`Libraries/Viewport/Viewport.js`** | **`cameraHeight`**, **`perspectiveStrength`**, **`_perspectiveIntensity`**; strength in **`_recompute()`** |
| **`Core/engineGlobals.js`** | Write perspective into **`state.viewport`** on boot |
| **`Core/GamePerspective.js`** | Delete **`resolveStructurePerspectiveStrength`**; keep boot merge helpers only or fold into engineGlobals |
| **`Libraries/Spatial/iso/ElevationCamera.js`** | Delete |
| **`Libraries/Spatial/iso/IsometricProjection.js`** | Read **`viewport.*`** only |
| **`Libraries/Render/Props3D/propMesh.js`** | **`viewport`**; no **`activePerspective`** read |
| **`Libraries/Canvas/QuantizedSpriteCache.js`** | **`viewport`** on draw APIs |
| **`Libraries/Render/WorldSceneRenderer.js`** | Viewport-only; kill wall camera |
| **`Libraries/Sandbox/gridStampDrawCache.js`** | Viewport-only |
| Wall / ground / overlay modules | Viewport-only |
| **`Render/Render.js`** | Boot writes viewport perspective fields |

---

## Review bar

- [ ] **`resolveElevationAlpha`** reads **`viewport.cameraHeight`** + **`viewport.perspectiveStrength`** — no other imports.
- [ ] Grep: zero **`elevationCameraFrom`**, **`resolveStructurePerspectiveStrength`**, **`resolvePerspectiveForViewport`**, **`activePerspective`** in draw/projection paths.
- [ ] Grep: zero **`wallPassCamera`**, zero **`drawCachedPropSprite(…, px, py`** at call sites.
- [ ] **`perspectiveStrength`** updates only in **`Viewport._recompute()`** and boot writes **`cameraHeight`** / **`_perspectiveIntensity`**.

---

## Verify (grep after ship)

```text
rg elevationCameraFrom Libraries Render
rg resolveStructurePerspectiveStrength
rg resolvePerspectiveForViewport
rg 'activePerspective' Libraries/Render Libraries/Spatial/iso Render
rg wallPassCamera
rg structurePerspectiveStrength
```
