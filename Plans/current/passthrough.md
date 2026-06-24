# Passthrough bullshit — top offenders

**Passthrough** = function, object, or param that exists only to forward data the caller already has to the callee, adding a layer without adding logic. In this codebase it usually means: duplicate handles, sync functions, getter wrappers, factory objects that return one closure, or threading `A` alongside `state` when `state.A` is right there.

**Sibling:** [`stupid.md`](stupid.md) (broader audit) · [`frame.md`](frame.md) (viewport migration — done)

---

## Tier 0 — fixed this session (do not reintroduce)

| Was | Why it was passthrough | Now |
|-----|------------------------|-----|
| `Renderer.worldSceneDrawInput` + `syncWorldSceneDrawInput` | Every frame copied `state.entityRegistry`, grid, surfaces into a parallel bag | `draw*(ctx, state, viewport)` |
| `proceduralSurfaceDraw.resolveProfileAt` closure | Fake mini-service on draw input; `boundGameState` repointed each frame | `state.worldSurfaces` + profile override/default at bake site |
| `ElevationCamera` / `elevationCameraFrom*` | Copy of `viewport.x/y` + two config numbers | Read `viewport` directly |
| `wallCtx` 15-field bag | Merged viewport + input + per-face scratch + options into one mutable struct | `(viewport, state, wallFaceScratch)` |
| `px, py, zoom` next to `viewport` | Same frame data threaded as scalars | Pass `viewport`; unpack in cache boundary only |
| `createStructureDrawPass(mode, renderer)` | Factory returning `{ draw: fn }` that only called two renderer methods | Inline `if (flat2d)` in `Renderer.drawWorldSceneStructure` |
| `worldPropAssets` re-export alias | Second name for `Assets/props/index.js` default export | **Deleted** — import `propCatalog` from `Assets/props/index.js` at asset lookup sites |
| `setPropCatalog` / `loadPropAssets` | Second init path beside module import | **Deleted** |

**Grep gate:** zero hits for `worldSceneDrawInput`, `syncWorldSceneDrawInput`, `proceduralSurfaceDraw`, `elevationCameraFrom`, `wallCtx`, `loadPropAssets`, `setPropCatalog`.

---

## Tier 1 — catalog getters (static data dressed as runtime API)

These wrap module-level records filled once at import/boot. Caller already has the key; getter adds indirection and encourages threading through constructors.

| Offender | Passthrough shape | Fix |
|----------|-------------------|-----|
| ~~`loadPropAssets()`~~ | "Load" that only loops static imports | **Deleted** — `PropCatalog.js` module init |
| ~~`getPropAsset(id)`~~ | `return worldPropAssets[id]` | **Deleted** — `worldPropAssets[id]` (P3-1) |
| `getWorldPropDefinitions()` | Second map mirroring assets | Build strategy from `asset.physics` at spawn (P3-3) |
| `getGameLauncher(id)` | `return GAME_LAUNCHERS[id]` | `GAME_LAUNCHERS[id]` + throw inline |
| `getSurfaceProceduralProfile(id)` | Wraps `resolveSurfaceProfile` | Import profile map directly |

**Still live:** `getGameLauncher` — see [`stupid.md`](stupid.md) P4-1. Twin prop **definitions** map (P3-3) still open.

---

## Tier 1b — AI distance passthrough — **done** ✅ ([`fsmroadmap.md`](fsmroadmap.md) Pass 3–5)

Was: `*Dist` copied perception → memory → blackboard → `reachForCandidate`. Now: **`facts.reachSteps`** once at intent adapter via `flowTargetSteps.js`.

---

## Tier 2 — boot `apply*` / `get*` pairs on library defaults

Pattern: `let activeX`; `applyGameX(config)` at boot; `getX()` on every hot read. Same data as exported `collisionSettings` / `physicsSettings` after one merge.

| Offender | Files |
|----------|-------|
| `LIBRARY_*_DEFAULTS` + mutable copy + getter | `collisionDefaults.js`, `physicsDefaults.js`, `propRenderDefaults.js`, `perspectiveDefaults.js` |
| `installEditorDefaults` orchestrating 8 module writes | `Core/engineGlobals.js` |

**Fix track:** [`library_defaults.md`](library_defaults.md) — export merged settings once; delete getters.

---

## Tier 3 — editor / sandbox param threading

| Offender | Passthrough shape | Fix |
|----------|-------------------|-----|
| `resolveSandboxBehaviors(asset, registeredBehaviors, state, prop)` | `registeredBehaviors` array passed through controller → tool → resolver | Static `BEHAVIOR_BY_ID`; filter `asset.sandbox.behaviors` |
| `createSandboxController` `spawnAsset()` closure | Returns `getPropAsset(session.getSpawnPropId())` every call | `worldPropAssets[id]` once at point of use |
| `SimulationEffectPass.draw(state, viewport, ctx, renderer)` | Passes whole `renderer` to reach `render3D.drawFloorProps` | Pass `state` only; import draw entry or colocate pass |
| `entity.render(ctx, renderer, state)` | Renderer passed into entity for occasional draw helper | Entity reads what it needs from `state` or static imports |

---

## Tier 4 — barrel re-export catalogs

`Libraries/*/index.js` files that list every symbol in a folder — importers use barrel instead of owning module. Adds hop, hides real dependency, goes stale.

**Worst offenders:** `Libraries/Radio/index.js` (7 re-exports), `Libraries/RoomGraph/index.js`, `Libraries/Pipeline/index.js`, `Libraries/Pathfinding/Corridor/index.js`.

**Rule:** `minimal-barrels.mdc` — import from the file that owns the symbol. Barrels only for true package entry points (e.g. `Pathfinding/index.js` — 4 lines).

---

## Tier 5 — duplicate maps / twin records

Same object or same derivation stored twice "for convenience":

| Twin | Why dumb |
|------|----------|
| `Assets/props/index.js` + `PropCatalog.worldPropAssets` | Same catalog, second export name | **Fixed** — assets import index; PropCatalog = definitions + recipes only |
| `worldPropRecipes` + `asset.draw` on module | Was copy-via-`registerPropDraw` |
| `worldPropDefinitions` + `asset.physics` | Strategy built from stripped copy |
| `resolveSurfaceProfileAtCoords` in `Render/game/` vs inline in draw | Profile resolution split across layers |

---

## Tier 6 — sync-* repoint functions (runtime, but still passthrough)

Not static catalog — these run every frame or every edit — but still "copy handles from A to B" when callers could read A:

| Function | What it repoints | Better |
|----------|------------------|--------|
| ~~`syncWorldSceneDrawInput`~~ | ~~state → draw input bag~~ | **Deleted** |
| `kineticSpatial.begin(state)` | Binds spatial frame for queries | OK — single module singleton, not a bag on Renderer |
| `syncRoomGraphBake` / `syncPassagePowerNetwork` | Invalidation + recompute | Real work — not passthrough if they bake |

**Smell test:** if the function only assigns fields from `state` onto `this.*` with no computation, delete the bag and pass `state`.

---

## Knock-down priority

1. **P3-2 / P3-3** — kill duplicate prop maps (biggest remaining static-data passthrough)
2. **P4-5** — stop threading `registeredBehaviors`
3. **library_defaults LD-*** — kill `getCollisionSettings`-style hot-path getters
4. **Barrel audit** — delete unused `Libraries/*/index.js` lines
5. **SimulationEffectPass signature** — stop passing `renderer` when `state` suffices

---

## Verify

```text
rg worldSceneDrawInput
rg syncWorldSceneDrawInput
rg proceduralSurfaceDraw
rg 'getPropAsset\('
rg getGameLauncher
rg registeredBehaviors
rg 'preyDist|foodDist|allyDist|threatDist|reachForCandidate'
rg 'from ".+/index\.js"'
```
