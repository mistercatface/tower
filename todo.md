# todo

## Next: gravity pad → floor prop

Same pattern as `void_pit`: `WorldProp` + `renderMode: "floor"` + quantized bake + `floorTriggers` + assembly overrides.

- [x] **`gravity_pad` asset** — generic defaults in `gravityPadDefaults.js`; assembly JSON overrides size/force/power.
- [x] **Rect floor triggers** — `halfExtents` + `resizeFloorPropHalfExtents`; `syncFloorTriggerAabb` for rects.
- [x] **Cached draw recipe** — `createGravityPadDraw()` (powered tint in cache key via `_off` suffix).
- [x] **Spawn + inspector** — menu spawn; inspector width/height/force X/Y; assembly override fields on worldProps.
- [ ] **`wallMode` on floor prop** — move pull-pad grid wall spawn/teardown off `padEffects` onto prop id.
- [ ] **Button → powered links (gravity prep)** — extend `syncSandboxPadPower` for floor prop ids; pinball still uses pull pads until migrated.
- [ ] **Remove `pull` pad preset** — migrate `pinballTable` pull pads → `gravity_pad` worldProps + button links; then delete pad pull path.

## After gravity pad: buttons → props

One **link + effect** system (`buttonLinks` → flipper / spawner / powered gravity zone). Two **activation** paths on `WorldProp`. Retire `pad:button` last.

### Shared core (extract from pads first)

Port pad-only names to prop-neutral APIs; callers pass any button-like entity (pad during transition, prop after).

- [ ] **`buttonLinks` on strategy** — `{ type: "worldProp", id } | { type: "floorProp", id }` (drop `type: "pad"` once gravity pad is a prop); runtime copy on spawn like `floorTriggers`.
- [ ] **Rename / generalize modules** — `buttonPad.js` → input + active-state helpers that read `prop.inputMode`, `prop._occupants`, `prop._pointerHeld`, etc.; `sandboxPadLinks.js` → `buttonLinks.js` (add/remove/wire/draw wires by prop id).
- [ ] **Unify effect runners** — `runButtonWorldPropLink`, `syncButtonFlipperLinks`, `tickButtonSpawnerLinks`, `syncSandboxPadPower` in `padEffects.js` → accept button source + link target by registry id (no `pad.preset === "button"` gate in hot path).
- [ ] **Powered targets** — `syncSandboxPadPower` sets `powered` on any floor fixture with `poweredLinkId` or listed in a button’s links (gravity_pad, future conveyor); not pad-id-only.

### Variant A — floor button (`button_floor` asset)

Today’s pad behavior: pointer + optional mass-on-zone, floor draw, not pushable.

- [ ] **Asset** — `renderMode: "floor"`, `spatialRole: "trigger"`, generic `radius` default; `sandbox.spawnLabel: "Button"`; **no** pool/level-specific values in asset (assembly JSON overrides radius, `inputMode`, `invert`, `massThreshold`).
- [ ] **Cached draw** — `createButtonFloorDraw()` from `drawPadButton` in `sandboxPads.js` (pressed state in cache key or sprite modifier).
- [ ] **Occupancy for mass modes** — floor prop gets `_occupants` + `processFloorShapes` (same as void pit) when `inputMode` is `massTap` | `massHold` | `massToggle`; reuse `buttonPadMass(state, prop)`.
- [ ] **Pointer input on props** — `createSandboxController` / `hitTestPad` → hit-test floor button props (aabb + circle); `handlePadPointerDown` → `handleButtonPointerDown(state, prop, world)`; `releaseButtonPointerHold` iterates button props.
- [ ] **Tick** — `tickButtonProp(state, spatialFrame, dt)` (or extend `tickFloorProps`): toggle/mass edge detect, `runPadEffect` button trigger, sustained flipper/spawner ticks (from `tickSandboxPads` button branch).
- [ ] **Inspector** — radius, input mode, mass threshold, invert, link list + wire mode (port from `sandboxToyUi` pad button section); wire target picker accepts floor props + world props (not pads).
- [ ] **Spawn** — menu lists `button_floor`; remove `pad:button` from `buildSpawnOptions` when default path works.

### Variant B — physical button (`button` / `button_bumper` 3D asset)

Pushable or heavy fixture; activates on impact, not pointer.

- [ ] **Asset** — `renderMode: "3d"`, `isPushable: true` (or high mass fixed fixture); `activation: { kind: "impact", minImpulse }` generic default; same `buttonLinks` schema as floor button.
- [ ] **Activation** — on pushable collision / `onHit`, if impulse ≥ threshold → fire button links once (tap) or latch while compressed (hold — optional later); reuse `runButtonWorldPropLink` / spawner / flipper runners.
- [ ] **Draw** — normal `PropRenderer` 3D recipe; optional visual “pressed” via state modifier or separate bake key when latched.
- [ ] **Inspector** — min impulse, links; no pointer fields; X/Y/facing like other props.
- [ ] **No floor pass** — lives in `draw3DBuildings`; participates in push collision broadphase unless `spatialRole: "trigger"` (physical buttons should **not** use trigger skip).

### Retire pad system

- [ ] **Remove `button` from `PAD_PRESETS`** — delete pad draw/tick/inspector/spawn paths in `sandboxPads.js`, `sandboxToyUi.js`, `assemblyPadSpawn.js` (assemblies use `button_floor` worldProps if needed).
- [ ] **Delete or empty `state.sandbox.pads` tick/draw** — if no presets remain, remove `tickSandboxPads`, `sandboxPadEffectPass`, pad selection UI; else only until last preset gone.
- [ ] **Archive** — move pad-only draw helpers to Deprecated or inline into button floor draw recipe.

### Order

1. Shared link/power core (unblocks gravity `powered` + floor button wiring).
2. `button_floor` (parity with current pad).
3. `button_bumper` 3D (new gameplay).
4. Remove `pad:button`.

## Floor props (done — void pit)

- [x] Floor render pass @ ~10.5, `PropRenderer` cache, back-to-front sort
- [x] `void_pit` asset + `createVoidPitDraw()` + `floorTriggers` (sink/unsink)
- [x] Pool table + 9-ball assemblies use `void_pit` with per-pocket overrides in JSON
- [x] Pad sink preset removed; menu spawns `void_pit` with generic asset defaults

### Later (floor props)

- [ ] Moving pit / conveyor smoke test — kinematic floor prop (x/y per tick), cache + triggers stay correct
- [ ] Floor prop resize from UI — rectangle/polygon draw beyond fixed spawn params

## Bounds / Box4 (deferred)

- [ ] **`Box4f` / `Box4i` math layer** — shared min/max interval ops for world + grid boxes.
- [ ] **Redo `GridCellRect` as min/max** — grid index frame; unify with `Aabb2D` algebra.
- [ ] **Frame converters** — `gridBoxToWorldAabbInto`, `worldAabbToGridBoxInto`, chunk origin → box.
- [ ] **Migrate `Aabb2D` object API** — optional thin view over `Box4f` backing store.
- [ ] **`boundsToCellRect(aabb)`** — accept `Aabb2D` at grid floor instead of four scalars.

## Entity registry

- [ ] **Hardening: sync pickups on state load** — registry membership + spatial tags when restoring sim state.
- [ ] **Reduce dual array/registry scans** — `pushablePhysicsPass`, assembly cleanup via `forEachOfKind` where order allows.

## WorldProp / state shape

- [ ] **Combat as one owned object** — `weaponLoadout`, turrets, etc. under `prop.combat`.
- [ ] **Type-specific state structs** — flipper, stand tip, rolling state in per-kind bags.
- [ ] **Locomotion agent boundary** — explicit locomotion component instead of field graft on every prop.

## Refactors

- [ ] **`drawKinematicsFrameToCanvas` bundle** — sprite bake scratch + rig + viewContext.
- [ ] **`NavigationContext`** — dedupe 11-arg nav infra in `planHpaSteering` / `replanPath`.
- [ ] **`getStaticRoofDrawCanvas` / mask bake** — fold mask coords into `ChunkDrawPass`.

## Render / bake perf

- [ ] **Cache `computeWallFaceSubdiv` on drawable** — keyed by quantized viewer position.
- [ ] **`blitWallFaceSubdiv` row/col band tables** — precompute subdiv bands once.
- [ ] **Face-level AABB cull before per-quad cull**.
- [ ] **`composeSurfaceImage` per-motif full-pixel passes** — offline motif bake or tile-based processing for heavy profiles.
- [ ] **Read `getTexelResolution(settings)` once per draw pass** in `WorldSurfaceEngine`.
- [ ] **Batch or cache `getStaticCellDamageAlphaAtGrid`** when many damaged cells visible.

## Vector overlay (later)

- [ ] Per-asset vector colors; skip kinematics tick in vector-only mode; projectile vector shapes.

## Smell

- [ ] **`createDefaultRenderPorts({ weaponVisuals: … })` in `engine.js`** — belongs elsewhere?

## Move to `Libraries/Deprecated/` (archive, disconnect from active arch)

Already archived: `sharedEdges/`, `sceneCompiler/`, `canvasInput/` (+ `canvasPointer.js` stays live).

Removed (too trivial to archive): `spawnStartProps.js`.

### Never-wired subsystems

- [ ] **`Libraries/Radio/`** — `createRadioSystem` never called; strip vestigial hooks after move.
- [ ] **`Libraries/Inspect/`** — 3D inspect viewer; zero external imports.
- [ ] **`Libraries/Triggers/PersistentTriggers.js`** (+ `Triggers/index.js` if empty).
- [ ] **`Libraries/Persistence/createDebouncedStorage.js`** (+ `Persistence/index.js` if empty).

### Still registered but legacy

- [ ] **`panelGrid` motif** — remove from `MotifRegistry` or archive under `Deprecated/`.

## Longer term

- [ ] **Interaction layers** — `drawLayer` + bitmask `collisionLayers` instead of scattered flags (`renderMode`, `spatialRole`, pad vs prop ticks). Not blocking pad→prop migrations.
