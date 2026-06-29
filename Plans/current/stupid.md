# Stupid shit audit

**Rule of thumb:** browser game. Hard refresh = clean slate. Static data is ESM imports. Never thread startup catalogs through constructors, draw passes, getters, or fake "load" calls.

See also: `[passthrough.md](passthrough.md)` · `[frame.md](frame.md)` · `[library_defaults.md](library_defaults.md)` · `.cursor/rules/browser-static-catalog.mdc`

---

## Model fix (copy this pattern)

**Before:** instanced catalog on `Renderer` / `PropRenderer`; `propRecipes` threaded through draw; `getWorldPropRecipes()`; `loadPropAssets()` boot chain.

**After:** `export const worldPropRecipes = {}` filled once at module init; import at lookup sites; `WorldSceneRenderer._drawProp → drawCachedPropSprite` directly; no load/getter theater.

**Not stupid:** per-frame sim state (`entityRegistry`, `obstacleGrid`, `viewport`); persistence boundaries; worker SAB / nav topology.

**Stupid:** leaving deprecated API shape in production because tests still import the old name — see [Tests follow the dialect](#tests-follow-the-dialect--never-ship-compatibility-shims).

---

## Tests follow the dialect — never ship compatibility shims

**Rule:** production code picks **one** dialect per concept. Tests use that dialect or get updated **in the same PR**. Never add prod-side aliases, adapter returns, or dual-shape wrappers so tests can lag.

### Stupid pattern

| Stupid | Example | Why |
|--------|---------|-----|
| **Thin alias export** | `buildSnakeDecisionContext` returns `{ blackboard, decisionSnapshot }` built from new `decisionContext` “for tests” | Keeps dead frame alive; tests never migrate; next pass edits the shim instead of the test |
| **“Land prod first”** | H2a ships new handle; grep allows `blackboard` in `tests/` until H2d | Two dialects permanently; same as half the draw stack on `viewport` and half on `px/py/zoom` |
| **Wrapper re-export file** | Keep `snakeDecisionModel.js` as 15-line forwarder after logic moved | File exists only for import paths; delete the file and fix imports |
| **Fallback reader** | `readThreatState(world)` → `blackboard ?? decisionSnapshot` | Resolver theater — pick one handle |
| **Test-only prod API** | Export `createSnakeDecisionBlackboard` after blackboard deleted | Test convenience becomes permanent surface area |

### Do instead

1. **Same PR:** change prod + every test that touched the old shape.
2. **Rewrite assertions** against the new handle (`decisionContext.known.threat`, not `blackboard.facts.known.threat`).
3. **Delete** old exports when nothing in `Libraries/` uses them — if only tests break, **fix the tests**.
4. **Delete obsolete tests** that only assert passthrough shape (e.g. “snapshot has same events reference as blackboard”) — not prod shims.

We already did this for props (`loadPropAssets` / `setPropCatalog` deleted; tests import `PropCatalog` directly — P0). Decision frame (H2) and draw frame ([viewport case history](#case-history--viewport-frame-px--py--zoom--elevationcamera)) are the same rule.

**Grep (when a pass declares a dead dialect):** zero hits in **`Libraries/` and `tests/`** — not “Libraries clean, tests later.”

---

## Case history — viewport frame (`px` / `py` / `zoom` / `ElevationCamera`)

**When:** pre–Steps 1–4 in `[frame.md](frame.md)` · fixed same migration pass as P2 draw cleanup.

### Before — three copies of the same camera

There was no single draw-frame handle. Every subsystem invented its own slice of viewer state and threaded it through signatures:


| Layer                        | What got threaded                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WorldSceneRenderer**       | `drawDebrisProps(ctx, state, px, py, zoom)`, same for floor props, belts, buildings — **every draw method** took scalars extracted from viewport at the entry point |
| **QuantizedSpriteCache**     | `drawCachedPropSprite(ctx, prop, px, py, renderKey, draw, animFrame, zoom)` — callers passed unpacked coords **again** even when they already had `viewport`        |
| **ElevationCamera**          | Parallel struct: copy of `viewport.x/y` + `cameraHeight` + `perspectiveStrength` — built by `elevationCameraFromViewportInto` at every wall/prop projection site    |
| **wallPassCamera / wallCtx** | Second camera copy for walls only, merged into a **15-field `wallCtx` bag** (`WallDrawContext.js`) alongside grid, surfaces, scratch, and options                   |
| **worldSceneDrawInput**      | Per-frame sync bag: copied `entityRegistry`, grid, surfaces into `Renderer.worldSceneDrawInput` so draw passes didn't take `state` directly                         |
| **Resolvers**                | `resolveStructurePerspectiveStrength`, `resolvePerspectiveForViewport`, `activePerspective` hot-path reads — boot config re-resolved through getter theater         |


Elevation projection, wall faces, prop mesh extrusion, overlay glyphs, and grid stamp draw each had **slightly different parameter lists** for the same three numbers. Pan/zoom changed `viewport` but callers had to remember to re-unpack and pass `px, py, zoom` downstream. Adding `cameraHeight` or zoom-scaled perspective meant touching **dozens of signatures**, not one struct.

### Why that was stupid

1. **Duplicate dialect** — `viewport`, `ElevationCamera`, `wallPassCamera`, and bare `px/py/zoom` were four names for one frame. Bugs showed up as “wall strength wrong after zoom” because wall draw read `wallCtx.camera` while props read resolver cache while belts read locals from five lines earlier.
2. **Signature explosion** — any new draw concern (tier cull, perspective strength, elevation alpha) required editing every method in the chain.
3. **Passthrough sync bags** — `syncWorldSceneDrawInput` copied handles the draw methods already had via `state`. Extra indirection, no logic, drift when a field moved on `state` but not the bag.
4. **Unpack-at-entry antipattern** — `const px = viewport.x` at the top of every draw method looked tidy but meant **N unpack sites** that could disagree after a pan. The cache boundary should unpack once; callers should pass the handle.
5. **Side-channel binds** — `Viewport.bindDrawSession()` tried to sneak `px/py` to recipes without threading params. Hidden global state, untestable, broke when draw order changed.
6. **Compatibility shims for tests** — keeping `ElevationCamera` or dual `{ blackboard, decisionSnapshot }` returns so tests did not need updating in the same PR. **Tests migrate with the frame** — see [Tests follow the dialect](#tests-follow-the-dialect--never-ship-compatibility-shims).

Same class of mistake as `*Dist` threaded perception → memory → blackboard (see `[fsmroadmap.md](fsmroadmap.md)`): **copy the fact at every layer instead of sync once · read many**.

### After — one rule

```text
Pass viewport. Read viewport. Nothing else.
```


| Change                          | Effect                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `**Viewport` owns elevation projection fields**  | `cameraHeight`, `_perspectiveStrengthBase`, zoom-scaled `perspectiveStrength` computed in `_recompute()` only             |
| **Delete `ElevationCamera.js`** | Projection takes `viewport`; no `elevationCameraFrom*` factories                                                          |
| **Cache boundary unpacks once** | `drawCachedPropSprite(ctx, prop, viewport, …)` — `px/py/zoom` only inside `QuantizedSpriteCache`                          |
| **Draw stack signature**        | `draw*(ctx, state, viewport)` — deleted `worldSceneDrawInput` / `syncWorldSceneDrawInput`                                 |
| **Wall draw**                   | `(viewport, state, wallFaceScratch)` — deleted `wallCtx`, `WallDrawContext.js`, `createStructureDrawPass` factory         |
| **Boot writes viewport once**   | `installEditorDefaults` sets `state.viewport.cameraHeight` + strength; hot path never touches `GamePerspective` resolvers |


**Grep gates (still enforced):** zero `elevationCameraFrom`, `wallPassCamera`, `wallCtx`, `worldSceneDrawInput`, `drawCachedPropSprite(…, px, py` at call sites. Full checklist: `[frame.md](frame.md#review-bar)`.

**Pattern for AI work:** same as `flowTargetSteps` + `GroundNavIntentAdapter` — compute frame facts **once at the boundary**, pass the handle, delete the copies. Pass H2a collapsed `blackboard`/`decisionSnapshot` to flat `decisionContext` — **no test accommodation aliases** ([Tests follow the dialect](#tests-follow-the-dialect--never-ship-compatibility-shims)).

---

## Done (reference)


| ID        | Title                                                            | Fix                                                                                                                                                         |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DONE-1    | `propRecipes` threaded + `PropRenderer` class                    | `worldPropRecipes` import at bake/draw sites. Deleted `PropRenderer.js`.                                                                                    |
| P0-1…P0-5 | `loadPropAssets` / getters / 55× test bootstraps                 | Module-init catalog; tests import `PropCatalog` directly.                                                                                                   |
| P1-1…P1-5 | Boot singleton / `applyGame`* / `installEditorDefaults` theater  | Static exports + one boot merge in `engineGlobals`.                                                                                                         |
| P2-3      | `createStructureDrawPass` factory                                | Inlined in `Renderer.drawWorldSceneStructure`; deleted `StructureDrawPass.js`.                                                                              |
| P2-4      | `wallCtx` 15-field bag                                           | `(viewport, state, wallFaceScratch)`; deleted `WallDrawContext.js`.                                                                                         |
| P2-5      | `px/py/zoom` in every draw method                                | Pass `viewport`; unpack once inside `QuantizedSpriteCache`. **Case history:** [viewport frame](#case-history--viewport-frame-px--py--zoom--elevationcamera) |
| P2-6      | `WorldSceneRenderer(settings)` ctor                              | Static import `gameWorldSurfaceSettings` in wall draw.                                                                                                      |
| P2-1      | `worldSceneDrawInput` + `syncWorldSceneDrawInput`                | `draw*(ctx, state, viewport)`; deleted sync bag.                                                                                                            |
| P2-2      | `proceduralSurfaceDraw` nested object                            | Wall bake reads `state.worldSurfaces` + seed; profile from override/default.                                                                                |
| P3-2      | Twin prop asset maps / aliases                                   | Raw assets: `import propCatalog from Assets/props/index.js`. `PropCatalog.js` = definitions + recipes only.                                                 |
| P3-1      | `getPropAsset(prop.type)` in draw bake                           | `propCatalog[prop.type]` at use sites.                                                                                                                      |
| P3-4      | `drawForcefields.js` parallel path                               | Merged into `gridStampDrawCache.js`.                                                                                                                        |
| P4-2      | `lockedRoomHarness` duplicate catalog boot                       | Uses full module-init catalog; no `setPropCatalog`.                                                                                                         |
| P4-4      | `createSandboxController` spawnAsset getter                      | `propCatalog[session.getSpawnPropId()]`.                                                                                                                    |
| Frame     | `ElevationCamera`, `wallPassCamera`, `wallCtx`, resolver getters | Deleted — see [case history](#case-history--viewport-frame-px--py--zoom--elevationcamera) and `[frame.md](frame.md)`.                                       |


---

## Open — P3 asset / catalog duplication

### P3-3 — `buildWorldPropStrategy` via `getWorldPropDefinitions()[type]`

**Stupid:** derived definition map separate from `asset.physics` — duplicate of `assetToDefinition` strip logic.

**Fix:** `WorldProp` constructor builds strategy from `asset.physics` inline. Delete definitions map if nothing else needs it.

**Files:** `Entities/WorldProp.js`, `Libraries/Props/propVisualAttachments.js`, `Libraries/Sandbox/spawnerConfig.js`

---

## Open — P4 thin getters / harness / barrels

### P4-1 — `getGameLauncher(launchId)`

**Stupid:** getter over `GAME_LAUNCHERS` record — same pattern as deleted `getWorldPropRecipes`.

**Fix:** `GAME_LAUNCHERS[launchId]` with throw at call site, or inline in `engine.js`.

**Files:** `Libraries/Game/gameLaunchers.js`, `Apps/Editor/engine.js`

### P4-2 — ~~`lockedRoomHarness` duplicate catalog boot~~ **done** (with P3-2)

### P4-4 — ~~`createSandboxController` spawnAsset getter~~ **done**

### P4-5 — `resolveSandboxBehaviors(asset, registeredBehaviors, …)`

**Stupid:** behavior registry threaded through editor tools; `asset.sandbox.behaviors` already on static asset.

**Fix:** static `BEHAVIOR_BY_ID` map; filter asset behaviors — no `registeredBehaviors` param.

**Files:** `Libraries/Sandbox/sandboxCapabilities.js`, `Libraries/SandboxEditor/createSandboxController.js`

### P4-6 — one-export barrels (`Libraries/Pause/index.js`, …)

**Stupid:** `import { X } from "../Pause/index.js"` passthrough catalogs.

**Fix:** import from owning module directly (`minimal-barrels.mdc`). Audit `Libraries/*/index.js`.

---

## Suggested knock-down order

```text
P3-3 → P4-5 → P4-1 → library_defaults LD-*
```

---

## Verify (grep gates)

```text
rg loadPropAssets
rg 'getPropAsset\('
rg getWorldPropDefinitions
rg getGameLauncher
rg worldSceneDrawInput
rg proceduralSurfaceDraw
rg elevationCameraFrom
rg wallCtx
rg worldPropAssets
rg setPropCatalog
# when a migration pass declares a dialect dead (H2a ✅):
rg 'decisionSnapshot|blackboard\.facts|createSnakeDecisionBlackboard|readThreatState|getDecisionSnapshot'
```

