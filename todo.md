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
