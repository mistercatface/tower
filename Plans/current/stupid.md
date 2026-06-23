# Stupid shit audit

**Rule of thumb:** browser game. Hard refresh = clean slate. Static data is ESM imports. Never thread startup catalogs through constructors, draw passes, getters, or fake "load" calls.

See also: [`passthrough.md`](passthrough.md) · [`frame.md`](frame.md) · [`library_defaults.md`](library_defaults.md) · `.cursor/rules/browser-static-catalog.mdc`

---

## Model fix (copy this pattern)

**Before:** instanced catalog on `Renderer` / `PropRenderer`; `propRecipes` threaded through draw; `getWorldPropRecipes()`; `loadPropAssets()` boot chain.

**After:** `export const worldPropRecipes = {}` filled once at module init; import at lookup sites; `WorldSceneRenderer._drawProp → drawCachedPropSprite` directly; no load/getter theater.

**Not stupid:** per-frame sim state (`entityRegistry`, `obstacleGrid`, `viewport`); persistence boundaries; worker SAB / nav topology.

---

## Done (reference)

| ID | Title | Fix |
|----|-------|-----|
| DONE-1 | `propRecipes` threaded + `PropRenderer` class | `worldPropRecipes` import at bake/draw sites. Deleted `PropRenderer.js`. |
| P0-1…P0-5 | `loadPropAssets` / getters / 55× test bootstraps | Module-init catalog; tests import `PropCatalog` directly. |
| P1-1…P1-5 | Boot singleton / `applyGame*` / `installEditorDefaults` theater | Static exports + one boot merge in `engineGlobals`. |
| P2-3 | `createStructureDrawPass` factory | Inlined in `Renderer.drawWorldSceneStructure`; deleted `StructureDrawPass.js`. |
| P2-4 | `wallCtx` 15-field bag | `(viewport, state, wallFaceScratch)`; deleted `WallDrawContext.js`. |
| P2-5 | `px/py/zoom` in every draw method | Pass `viewport`; unpack once inside `QuantizedSpriteCache`. |
| P2-6 | `WorldSceneRenderer(settings)` ctor | Static import `gameWorldSurfaceSettings` in wall draw. |
| P2-1 | `worldSceneDrawInput` + `syncWorldSceneDrawInput` | `draw*(ctx, state, viewport)`; deleted sync bag. |
| P2-2 | `proceduralSurfaceDraw` nested object | Wall bake reads `state.worldSurfaces` + seed; profile from override/default. |
| P3-4 | `drawForcefields.js` parallel path | Merged into `gridStampDrawCache.js`. |
| Frame | `ElevationCamera`, camera copies, overlay px/py | See [`frame.md`](frame.md) — Steps 1–4 complete. |

---

## Open — P3 asset / catalog duplication

### P3-1 — `getPropAsset(prop.type)` in draw bake

**Stupid:** hot draw closure calls getter for footprint fallback every bake miss.

**Fix:** `worldPropAssets[prop.type]` at use sites, or store needed physics on `prop.strategy` at spawn.

**Files:** `Libraries/Props/primitives/polygonPrimitive.js`, `Libraries/Render/Props3D/pipeElbow.js`, `flipperPaddle.js`

### P3-2 — `Assets/props/index.js` AND `PropCatalog` maps

**Stupid:** same prop objects in two maps — index catalog + `loadPropAssets` copies to `assetsById`.

**Fix:** one source: import `Assets/props/index.js` once into `PropCatalog` module init. Not both.

**Files:** `Assets/props/index.js`, `Libraries/Props/PropCatalog.js`, `Libraries/Props/loadPropAssets.js`

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

### P4-2 — `lockedRoomHarness` duplicate catalog boot

**Stupid:** reimplements `assetDefinition + setPropCatalog + propsLoaded guard` for two props.

**Fix:** import ball + button assets directly, or use full module-init catalog.

**Files:** `tests/lockedRoomHarness.js`

### P4-4 — `createSandboxController` `spawnAsset = () => getPropAsset(...)`

**Stupid:** closure factory returning getter call.

**Fix:** `worldPropAssets[session.getSpawnPropId()]` at use sites.

**Files:** `Libraries/SandboxEditor/createSandboxController.js`

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
P3-2 → P3-3 → P3-1 → P4-5 → P4-1 → library_defaults LD-*
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
rg PropRenderer
```
