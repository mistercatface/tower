# todo

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

## Floor props (void pit first — template for conveyor belt, moving pits, etc.)

Unified model: one `WorldProp` with `renderMode: "floor"`, quantized `PropRenderer` bake, floor triggers for one-way physics (`isPushable: false`). Replaces pad `sink` draw + separate pit visual.

### 1. Floor render layer + cache pipeline

- [x] **`renderMode: "floor"`** in `propStrategy` / asset loader (alongside `"3d"`, `"debris"`, `"none"`).
- [x] **Floor draw pass @ zIndex ~10.5** — query `worldProp` where `renderMode === "floor"`, call existing `drawWorldProp` / `PropRenderer` (same `getOrBakePropSprite` keys as structure props).
- [x] **Sort back-to-front** by distance to camera (same as `draw3DBuildings`) so overlapping floor props depth-sort correctly.

### 2. Void pit visual as a cached prop recipe

- [x] **`createVoidPitDraw()` asset recipe** — port stacked-circle logic from `drawPitInterior` into a bake fn `(ctx, prop, px, py)` using pit depth params on the prop.
- [x] **Strategy fields** — `sinkDepth`, mouth radius (or reuse `radius`), cache key suffix for depth variants.
- [ ] **Verify camera quantization** — pit rebakes on viewer-offset buckets like pool balls; no raw per-frame pit draw.

### 3. Floor triggers + collision participation on props

- [x] **`floorTriggers[]` on strategy** — reuse `PAD_EFFECTS` / `runPadEffect` (`sink`, `unsink`, `pull`) keyed off prop instead of pad.
- [x] **Occupancy on props** — run `processFloorShapes` against floor props each tick; wire enter/exit/occupied like `tickSandboxPads`.
- [x] **Participation flags at spawn** — `isPushable: false`, `gravityImmune: true`; skip combat broadphase for `spatialRole: "trigger"`.

### 4. Migrate void pit off pads + prove moving floor prop

- [x] **Floor prop asset** — `void_pit` with floor renderMode, pit draw recipe, sink triggers, assembly spawn fields (`radius`, `depth`, `captureTolerance`).
- [x] **Pool table assembly** — floor props for pockets instead of `preset: "sink"` pads.
- [ ] **Moving pit smoke test** — kinematic floor prop (update x/y per tick) still caches and triggers sink correctly; documents pattern for conveyor belt (pull trigger + floor visual on same prop).
- [ ] **Deprecate pad sink preset** — archive `drawPitInterior` pad draw path once floor prop is default; keep pull/button pads until belt migration if needed.

## Move to `Libraries/Deprecated/` (archive, disconnect from active arch)

Already archived:

- `sharedEdges/` (+ `Render/Deprecated/SharedEdgeWorkerEntry.js`)
- `sceneCompiler/` — `SceneCompiler`, `RenderScene`, `Renderables`, sim-roof chunk clip + `drawRoofLayers`
- `canvasInput/` — unified `CanvasInputController` cluster (`canvasPointer.js` stays live in `Input/`)

Removed (too trivial to archive): `spawnStartProps.js`.

### Never-wired subsystems

- [ ] **`Libraries/Radio/`** — `createRadioSystem` never called; strip vestigial hooks after move (`SharedGameState.radioSeenThisRun`, `EventNames` radio UI events).
- [ ] **`Libraries/Inspect/`** — 3D inspect viewer; zero external imports.
- [ ] **`Libraries/Triggers/PersistentTriggers.js`** (+ `Triggers/index.js` if empty).
- [ ] **`Libraries/Persistence/createDebouncedStorage.js`** (+ `Persistence/index.js` if empty).

### Still registered but legacy

- [ ] **`panelGrid` motif** — remove from `MotifRegistry` or archive under `Deprecated/` if keeping for reference (`"Panel grid (legacy)"` label).
