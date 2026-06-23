# Kill `LIBRARY_*` defaults — Core owns game config, boot writes once

Same class of stupid as `bootPerspective`, `resolvePerspectiveConfig(null)`, and `applyGame*` getters: **defaults declared in Libraries, merged at boot into mutable module globals, hot paths read the globals.** Two copies of truth (`LIBRARY_*` + live export), Library→Core dependency inversion, and fake “games override via gameDefinition” comments on files that are really editor boot knobs.

**Rule:** Game/engine defaults live in **`Core/Game*.js`**. **`installEditorDefaults` resolves once** and writes live settings. Libraries import the **merged live export** (or receive values from state) — they do **not** own baseline constants named `LIBRARY_*`.

**Not this doc:** domain feature tuning that is not game-definition boot (belt force, button radius, LOS shadow alpha). Those stay colocated with the feature; rename to `DEFAULT_*` without `LIBRARY_` if needed.

See also: [`stupid.js`](stupid.js) P1-4, P1-5 · [`frame.md`](frame.md) perspective slice (done).

---

## Target shape

```text
Core/GamePerspective.js      → DEFAULT_* + resolvePerspectiveConfig(profile)
Core/GameCollision.js        → DEFAULT_* + resolveCollisionConfig(profile)   [new]
Core/GamePhysics.js          → DEFAULT_* + resolvePhysicsConfig(profile)     [new]
Core/GamePropRender.js       → DEFAULT_* + resolvePropRenderConfig(profile)  [new, or merge into GamePropPixelSize]
Core/GameProceduralDesign.js → resolveProceduralDesignConfig (already Core)
Core/engineGlobals.js        → installEditorDefaults: resolve* once → write live exports / state.viewport

Libraries/*                  → export let collisionSettings / physicsSettings / propQuantizeSteps
                               filled ONLY from engineGlobals boot (no LIBRARY_* in Libraries)
                               OR: Core exports collisionSettings and Libraries import from Core
```

**Forbidden after migration:**

- `LIBRARY_DEFAULT_*`, `LIBRARY_*_DEFAULTS` anywhere
- `structuredClone(LIBRARY_*)` seed objects in Libraries
- `resolveFooConfig(null)` / constructor fake-boot
- Passthrough `export const defaultX = LIBRARY_DEFAULT_X` in Core importing from Libraries
- Mutable `surfaceProfileDefaults.defaultId` written from boot while `activeProceduralDesign.current` also exists

---

## Done

| Item | Was | Now |
|------|-----|-----|
| Iso perspective | `Libraries/Spatial/iso/perspectiveDefaults.js` (`LIBRARY_DEFAULT_CAMERA_HEIGHT`, …) | `Core/GamePerspective.js` — `DEFAULT_CAMERA_HEIGHT`, `DEFAULT_PERSPECTIVE_STRENGTH`, `resolvePerspectiveConfig`. **Deleted** `perspectiveDefaults.js`. Viewport gets perspective **only** from `applyPerspectiveConfig` at boot. |
| LOS shadow camera fallback | `LIBRARY_DEFAULT_CAMERA_HEIGHT` | `viewport.cameraHeight` |

---

## Inventory — kill list

### P0 — boot game settings still owned by Libraries (`LIBRARY_*` + clone + merge)

| ID | File | Symbols | Hot readers | Stupid | Fix |
|----|------|---------|-------------|--------|-----|
| LD-1 | `Libraries/Collision/collisionDefaults.js` | `LIBRARY_COLLISION_DEFAULTS`, `collisionSettings` | `kineticPhysicsPass`, `kineticContactSolver`, `collisionPipeline`, broadphase, pair stream | 25-field baseline in Libraries; boot merges `LIBRARY_*` into clone; tests assert against `LIBRARY_*` not live settings | **`Core/GameCollision.js`**: `DEFAULT_COLLISION_SETTINGS`, `resolveCollisionConfig(profile)`. Boot: `replaceRecordContents(collisionSettings, resolveCollisionConfig(profile))`. Delete `LIBRARY_COLLISION_DEFAULTS`. Library file exports **only** `collisionSettings` (empty until boot) or move live export to Core. |
| LD-2 | `Libraries/Motion/physicsDefaults.js` | `LIBRARY_PHYSICS_DEFAULTS`, `physicsSettings` | ground nav behaviors, `kineticRollActuator` | Same twin-object pattern | **`Core/GamePhysics.js`**: `DEFAULT_PHYSICS_SETTINGS`, `resolvePhysicsConfig(profile)`. Same boot pattern as LD-1. |
| LD-3 | `Libraries/Props/propRenderDefaults.js` | `LIBRARY_PROP_QUANTIZE_STEPS`, `propQuantizeSteps` | `resolvePropQuantizeSteps`, sprite facing cache | Boot merges facing with `LIBRARY_*` fallback inline in engineGlobals | **`Core/GamePropRender.js`** (or extend `GamePropPixelSize.js`): `DEFAULT_PROP_QUANTIZE_STEPS`, `resolvePropQuantizeConfig(profile)`. |
| LD-4 | `Libraries/Motion/bodyDefaults.js` | `LIBRARY_DEFAULT_BAKE_PIXEL_SIZE` | `Core/GamePropPixelSize.js` (`defaultPropPixelSize` passthrough) | Core re-exports library constant — inverted ownership | **`DEFAULT_PROP_PIXEL_SIZE` in `Core/GamePropPixelSize.js` only.** Delete import from `bodyDefaults.js`. `resolvePropPixelSize(profile)` returns Core default. |

**`installEditorDefaults` today (theater to collapse):**

```javascript
replaceRecordContents(collisionSettings, mergeObjectTree(LIBRARY_COLLISION_DEFAULTS, profile?.collisionSettings));
replaceRecordContents(physicsSettings, mergeObjectTree(LIBRARY_PHYSICS_DEFAULTS, profile?.physicsSettings));
replaceRecordContents(propQuantizeSteps, { facing: facing != null ? facing : LIBRARY_PROP_QUANTIZE_STEPS.facing });
setPropPixelSize(resolvePropPixelSize(profile));
```

**After:** no `LIBRARY_*` imports in `engineGlobals.js` — only `resolve*Config(profile)` from Core.

---

### P1 — same boot-global class, no `LIBRARY_` prefix yet

| ID | File | Symbols | Stupid | Fix |
|----|------|---------|--------|-----|
| LD-5 | `Libraries/Procedural/SurfaceProfileProvider.js` | `surfaceProfileDefaults.defaultId` | Mutable library global; boot writes `defaultId` while `activeProceduralDesign.current` already holds `defaultSurfaceProfileId` | Delete `surfaceProfileDefaults`. Call sites use `activeProceduralDesign.current.defaultSurfaceProfileId` or `resolveActiveSurfaceProfileId({ layer: 1 })`. Editor default id stays in `engineGlobals` (`EDITOR_DEFAULT_SURFACE_PROFILE_ID`) or Core profile resolver. |
| LD-6 | `Core/GameProceduralDesign.js` | `activeProceduralDesign.current` | Nullable global + throw-on-read helpers — same “set at boot, read everywhere” as collisionSettings | Acceptable **if** only Core writes `.current` once at boot. Finish LD-5 so surface code doesn’t also read `surfaceProfileDefaults`. |
| LD-7 | `Core/GamePropPixelSize.js` | `export let propPixelSize`, `setPropPixelSize` | Boot mutation of module global | Keep until LD-4 lands; then `propPixelSize` set once from `resolvePropPixelSize(profile)` — no `defaultPropPixelSize` alias, no library import. |
| LD-8 | `Libraries/Playback/playbackController.js` | `LIBRARY_PLAYBACK_DEFAULTS` | Game-speed UI limits in Libraries; not in gameDefinition boot at all | **`Core/GamePlayback.js`** or `Config/editor.js`: `DEFAULT_PLAYBACK` + optional profile override later. Rename resolvers to read Core constant. |

---

### P2 — tests / harness still coupled to `LIBRARY_*`

| File | Fix |
|------|-----|
| `tests/collisionDefaults.test.js` | Assert `collisionSettings` after boot or import `DEFAULT_COLLISION_SETTINGS` from Core |
| `tests/kineticSleepProps.test.js`, `activeKineticBodies.test.js`, `kineticIslands.test.js` | `SLEEP_FRAMES` from `collisionSettings.kineticSleep.frames` or Core default export |
| `tests/harness/collisionSettingsHarness.js` | Merge from `DEFAULT_COLLISION_SETTINGS` (Core), not `LIBRARY_COLLISION_DEFAULTS` |
| `Libraries/Playback/index.js` | Re-export from Core after LD-8 |

---

### P3 — legitimate library constants (do **not** move to Core)

These are **feature physics/visual tuning**, not game-definition boot. OK in Libraries; optional rename `DEFAULT_*` without `LIBRARY_` prefix for consistency.

| File | Constant | Notes |
|------|----------|-------|
| `Libraries/Motion/bodyDefaults.js` | `LIBRARY_DEFAULT_BODY_RADIUS` → `DEFAULT_BODY_RADIUS` | Spawn fallback in `resolveBodyRadius` — used widely; not merged at boot. Rename only unless spawn defaults become game-defined. |
| `Libraries/Sandbox/floorBeltDefaults.js` | `DEFAULT_FLOOR_BELT_FORCE` | Already fine |
| `Libraries/Sandbox/buttonFloorDefaults.js` | `DEFAULT_BUTTON_FLOOR_RADIUS` | Already fine |
| `Libraries/Render/losShadow/losShadowDefaults.js` | `LOS_SHADOW_*_DEFAULT` | Feature overlay tuning |
| `Libraries/Viewport/Viewport.js` | `MIN_WORLD_SPAN = 10` | Zoom math clamp, not game config |

---

## Migration order

1. **LD-1 collision** — highest call-site count; establishes Core/Game* pattern for the rest.
2. **LD-2 physics** — same mechanical change as LD-1.
3. **LD-4 + LD-3 prop pixel size + quantize steps** — one Core pass (`GamePropPixelSize` + quantize).
4. **LD-5 surface profile defaultId** — delete duplicate global.
5. **LD-8 playback** — small, isolated.
6. **P2 test/harness sweep** — grep `LIBRARY_` → zero in repo.
7. **Delete empty `*Defaults.js` seed layers** in Libraries once live exports live in Core or boot-only fills.

---

## Grep gates

```text
rg 'LIBRARY_DEFAULT|LIBRARY_.*_DEFAULTS' --glob '*.js'
rg 'Library baseline' --glob '*.js'
rg 'resolve\w+Config\(null\)' --glob '*.js'
rg 'structuredClone\(LIBRARY' --glob '*.js'
```

All must hit **zero** (except this plan file and stale docs until updated).

---

## `installEditorDefaults` end state

Should shrink to **runtime wiring only**:

- worker URL once
- `resolve*Config(profile)` → write Core-owned live settings + `state.viewport.applyPerspectiveConfig`
- `state.worldSurfaces.settings = …`
- cache invalidation when bake constants change

Should **not** import baseline constants from `Libraries/`.

---

## Doc cleanup after code lands

- `Plans/rendering.md` — remove `perspectiveDefaults.js` reference
- `Plans/current/stupid.js` — add LD-* cross-ref or mark P1-4 follow-up done when grep clean
- `.cursor/rules/*` — no `LIBRARY_*` in examples
