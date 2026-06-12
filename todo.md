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

## Wall height / draw

- [ ] **Hoist view constants per pass** — `cameraHeight` + `ElevationCamera` on `ChunkDrawPass` / `WallDrawContext` once per frame.
- [ ] **Single wall-height px resolver at draw boundary** — consolidate at draw/bake entry; drop redundant `defaultWallHeight` threading.

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
