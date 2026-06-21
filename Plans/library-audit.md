# Library audit — current map of the codebase

This is the cross-cutting index for the engine. It answers two questions:

- **Where does this concern live?**
- **Is this engine/library code, sandbox tooling, or snake-game-specific code?**

Spoke docs stay authoritative for feature progress: [physics](./physics.md), [pathfinding](./pathfinding.md), [rendering](./rendering.md), [procedural](./procedural.md), and [AI](./AI.md). This audit keeps the folder map and naming traps current.

**Legend:** ✅ shipped and wired · 🟡 partial / scaffolding · ⬜ inert or not behaviorally wired · 🔗 cross-cutting foundation.

---

## 1. Naming traps — read first

| You see… | It actually is… | Do not confuse it with… |
|---|---|---|
| `Libraries/Procedural/Motifs`, `Fields`, `Noise` | Surface texture synthesis for floors/walls | Geometry generation, which lives in `Libraries/CA`, `Libraries/RoomGraph`, and `Libraries/Procedural/Mazes` |
| `Libraries/Procedural/Mazes` | Geometry/layout helpers for rail mazes, belt corridors, split layouts, walkable indexes | Texture motifs under `Libraries/Procedural/Motifs` |
| `Spatial/iso/IsometricProjection.js` | Camera-relative radial elevation projection | True fixed isometric mode, which is still future rendering work |
| `prop.strategy` | WorldProp capability/config pattern: physics, render keys, sandbox affordances | AI strategy / GOAP / objectives, which are not implemented |
| `goal` in `snakeGoals` or ground nav | A movement target or food prop | AI objective / strategic goal |
| `Libraries/FSM/transition.js` | Generic enter/exit transition helper for prop lifecycle-style FSMs | Agent intent FSM, now `Libraries/AI/agentIntent/createAgentIntent.js` |
| `Libraries/AI/brain` | Spatial cell memory plus nav-step penalty producer | Entity target memory, now `Libraries/AI/memory/targetMemory.js` |
| `navStepPenalty.js` x2 | `AI/brain/navStepPenalty.js` builds penalties; `Pathfinding/navStepPenalty.js` consumes them in A* | A duplicate implementation |
| `Libraries/Navigation` | Runtime nav wiring, perception, steering, topology sync | Search algorithms, which live in `Libraries/Pathfinding` |
| `Libraries/Motion` | Integration, constraints, solver, wall resolution | Collision detection, which lives in `Libraries/Spatial/collision` |
| `Libraries/WorldSurface` | Chunk floor/wall texture-atlas baking | Per-prop surface texturing in `Libraries/Render/SurfaceTexturing` |
| `Libraries/Sandbox` | Mixed engine-facing sandbox systems: nav behaviors, chains, floor systems, snapshots, map-gen UI | Snake game rules in `Libraries/Game/snake` |

---

## 2. Top-level map

| Path | Role | Owner / status |
|---|---|---|
| `Apps/Editor` | Editor shell, RAF loop, TileLab/sandbox mount, preview, map-gen/profile UI | tooling, rendering |
| `Assets/props` | Placed prop assets: physics, sandbox metadata, render recipes | cross-cutting |
| `Config` | Game configs, world config, procedural profiles and theme storage | per-domain |
| `Core` | Engine globals, events, physics/collision/perspective/procedural design settings | 🔗 foundations |
| `Entities` | `Entity`, `WorldProp` base model | 🔗 physics/render/AI |
| `GameState` | Registries, shared state, kinetic tick/session, sandbox state, snapshot state | 🔗 foundations |
| `Libraries` | Most engine, sandbox, AI, pathfinding, render, physics, procedural code | all |
| `Render` | Top-level render loop, draw passes, simulation viewport, game surface bootstrap | rendering |
| `Systems` | World kinetic frame population only (`Systems/World/KineticSpatialFrame.js`) | physics |
| `tests` | Node test suites for engine, sandbox, snake, and docs-adjacent behavior | all |

The old navigation service/context wording is no longer the map of reality. Navigation runtime lives in `Libraries/Navigation` and is mounted by shared game state / worker navigation setup.

---

## 3. Engine libraries

### 3.1 Physics and spatial simulation

| Path | State | Role |
|---|---|---|
| `Libraries/Motion` | ✅ | Integration, damping, substeps, constraints, islands, sleep, wall collision resolver, kinetic physics pass |
| `Libraries/Spatial/collision` | ✅ | Broadphase snapshots, SAT/circle narrow phase, manifolds, pair stream, contact solve, side-effect hooks |
| `Libraries/Spatial/geometry` | ✅ | Wall geometry, circle sweep |
| `Libraries/Spatial/indexes` | ✅ | Uniform-grid broadphase (`EntityGrid`) |
| `Libraries/Spatial/world` | ✅ | `SpatialFrameCore` frame/candidate cache shared by world systems |
| `Systems/World` | ✅ | Kinetic spatial frame assembly |

### 3.2 Pathfinding and navigation

| Path | State | Role |
|---|---|---|
| `Libraries/Pathfinding` | ✅ | A*, HPA*, region graph, flow fields, nav sessions, worker path requests, topology SAB packing |
| `Libraries/Pathfinding/Corridor` | ✅ | Cardinal corridor solver used by room graph / procedural bakes |
| `Libraries/Navigation/NavRuntime.js` | ✅ | Runtime nav owner: worker, session, topology, invalidation/commit spine |
| `Libraries/Navigation/NavTopology.js` | ✅ | Baked walkability/topology view consumed by runtime and workers |
| `Libraries/Navigation/perception` | ✅ | Observer vision frame, grid-cell vision, LOS-driven perception |
| `Libraries/Navigation/steering` | ✅ | Explore steering, now backed by EQS-style option scoring |
| `Libraries/Workers` | ✅ | SAB slot worker host and HPA/flow worker entries |

### 3.3 AI and agent intelligence

| Path | State | Role |
|---|---|---|
| `Libraries/AI/agentIntent` | ✅ | Generic agent intent FSM host (`createAgentIntent`) |
| `Libraries/AI/brain` | ✅ | Spatial memory and memory-to-A* penalty producer |
| `Libraries/AI/memory` | ✅ | Generic TTL target memory (`targetMemory`) |
| `Libraries/AI/utility` | ✅ | Generic utility/net-value candidate scoring |
| `Libraries/AI/eqs` | ✅ | Tiny EQS-style weighted option scoring |
| `Libraries/Agent` | ✅ | Agent pose / steering result contracts |
| `Libraries/FSM` | 🟡 | Generic transition helper, separate from agent intent |

Current first consumer: snake forage. Generic pieces now live outside `Libraries/Game/snake`.

### 3.4 Rendering and presentation

| Path | State | Role |
|---|---|---|
| `Libraries/Render/Props3D` | ✅ | Prop meshes, projection, face culling, primitive renderers |
| `Libraries/Render/Structure3D` | ✅ | Voxel wall atlas and rail edge rendering |
| `Libraries/Render/overlays` | ✅ | Overlay command pipeline for editor/sandbox feedback |
| `Libraries/Render/SurfaceTexturing` | ✅ | Sphere/cell/decal texture patches |
| `Libraries/Render` | ✅ | Scene assembly, prop draw entry, vector mode, map caches |
| `Libraries/Canvas` | ✅ | Quantized sprite cache, baked cache, affine texture, offscreen canvas |
| `Libraries/Spatial/iso` | ✅ | Radial elevation projection, camera, shadow math (`shadowProjection.js` still unwired) |
| `Libraries/Viewport` | ✅ | Pan/zoom and world/screen transforms |
| `Libraries/WorldSurface` | ✅ | Chunk surface atlas baking and draw coordination |
| `Libraries/World` | ✅ | Wall/grid bake helpers consumed by render/surface systems |
| `Render` and `Render/game` | ✅ | Top-level render frame and game surface/profile wiring |

### 3.5 Procedural and generation

| Path | State | Role |
|---|---|---|
| `Libraries/CA` | ✅ | Cellular automata cave carving |
| `Libraries/RoomGraph` | ✅ | Room graph model, bake to geometry, corridors, locked rooms, puzzle template |
| `Libraries/Procedural/Mazes` | ✅ | Maze/corridor generation helpers, rail maze belts, snake split layout, nav walkable indexes |
| `Libraries/Procedural/Motifs`, `Fields`, `Noise` | ✅ | Surface texture synthesis |
| `Config/procedural` | ✅ | Named procedural surface profiles and theme storage |

### 3.6 Sandbox, editor, and gameplay substrate

| Area | State | Role |
|---|---|---|
| `Libraries/Sandbox/groundNav` | ✅ | HPA, flow, direct, and cell-target ground-nav behaviors |
| `Libraries/Sandbox/behaviors` | ✅ | Prop behavior adapters: flipper, spawner, cue strike, drag launch |
| `Libraries/Sandbox` chains | ✅ | Chain links, linked-body spawn, kinetic roll actuator |
| `Libraries/Sandbox` floor systems | ✅ | Floor occupancy/effects, belts, buttons, forcefields, passage power |
| `Libraries/Sandbox` scene/snapshot | ✅ | Placed spawn, scene placeables, snapshot persistence, selection inspectors |
| `Libraries/SandboxEditor` | ✅ | Controller, pointer tools, wire tools, inspectors, overlay command collection |
| `Libraries/Editor` | ✅ | Low-level editor/canvas interaction helpers |
| `Libraries/UI` | ✅ | Controls, field rendering, pipeline/profile UI |
| `Libraries/Pipeline` | 🟡 | Pipeline schema/registry/export validation for authoring flows |

### 3.7 Cross-cutting foundations

| Path | Role |
|---|---|
| `Libraries/DataStructures` | Heap, BFS toolkit, LRU, cell keys/rects, sparse bucket grid |
| `Libraries/Spatial/grid` | Shared grid, cell edges, floor store, nav epoch, boundary occupancy, vertex passability |
| `Libraries/Spatial/query` | LOS, ray/circle casts, wall segment queries |
| `Libraries/Math` | Vectors, angles, polygons, segments, seeded RNG, hashes |
| `Libraries/Random` | Seeded random and weighted pick |
| `Libraries/Config` | Partial config merge |
| `Libraries/Color` | Tint, hue shift, brightness, visual overrides |
| `Libraries/Input`, `Events`, `Triggers`, `Persistence`, `Playback`, `Pause`, `Scheduler`, `Radio`, `CueStick` | Small focused engine/tooling packages |

---

## 4. Game-specific code: snake

| Path | Role | Reusable pieces it consumes |
|---|---|---|
| `Libraries/Game/snake/snakeAutosim.js` | Snake chain sim, metabolism, sprinting, food/grow loop, brain creation | Motion, ground nav, AI brain |
| `Libraries/Game/snake/createSnakeForageIntent.js` | Snake adapter over generic agent intent | `AI/agentIntent`, target memory, HPA cell nav |
| `Libraries/Game/snake/snakeDecisionModel.js` | Snake facts, hunger/threat derivation, snake scorers, policy mapping | `AI/utility/utilityScoring` |
| `Libraries/Game/snake/snakeIntentMemory.js` | Snake threat/prey/food adapter | `AI/memory/targetMemory` |
| `Libraries/Game/snake/snakeIntent.js` | Snake perception: threat/prey/food and distances | Navigation perception |
| `Libraries/Game/snake/snakeIntentStates.js` | Snake state implementations: explore, seek_food, seek_prey, flee | Generic agent intent context/effects |
| `Libraries/Game/snake/setupSnakeGame.js`, `snakeScene.js`, `SnakeInstance.js`, combat/HUD/overlays | Snake game rules, scene, lifecycle, UI | Sandbox, physics, render |

Current architecture:

```text
createAgentIntent (generic)
  -> createSnakeForageIntent (snake adapter)
    -> snakeDecisionModel (snake scorers + facts)
      -> utilityScoring (generic score maps/details)
    -> snakeIntentMemory
      -> targetMemory (generic TTL target records)
    -> snakeIntentStates (domain states)
  -> snakeAutosim (game orchestration)
```

---

## 5. Test coverage map

| Subsystem | Representative tests |
|---|---|
| Physics / kinetic | `kineticConstraintSolver`, `kineticContactSolver`, `kineticNarrowPhase`, `kineticPairStream`, `kineticIslands`, `kineticSleepProps`, `kineticContactManifold`, `activeKineticBodies`, `bodyMass`, `wallResolution`, `chainLinks`, `chainVsWallGrowth` |
| Pathfinding / nav | `AStar`, `hpaGroundNavReplan`, `hpaPathSlot`, `hpaStitch`, `hpaRegionGraph`, `gridNavContext`, `hpaBeltNav`, `flowFieldBfs`, `lineOfSight`, corridor tests |
| AI / decisions | `brain`, `navStepPenalty`, `targetMemory`, `utilityScoring`, `eqsScoreOptions`, `goalSeekAutosim`, `gridCellVision` |
| Snake game | `snakeDecisionModel`, `snakeIntent`, `snakeFsmTransitions`, `snakeForageIntent`, `snakeAutosim`, `snakeMulti`, `snakeStarvation`, `snakePerfBudget`, `snakeMinLengthDeath`, `snakeSplit`, `snakeScale` |
| Procedural / mazes | `puzzleTemplateBeltCrate`, `lockedRoom`, `railMaze*`, `snakeSplitLayout`, `cavernFloorCells`, `navWalkableIndex` |
| Rendering / props | `vectorProp`, `drawShapeParity`, `maskCompositor`, `propScale`, `colorVisualOverride`, `shapeFirstProps`, `spawnShapeFamily`, `sandboxSceneSnapshot` |

Coverage read: physics, pathfinding, AI, and snake are the best-tested. Procedural authorship and projection/perspective-mode math are still thinner than their foundations.

---

## 6. Where do I add X?

| I want to add… | Go to | Pattern |
|---|---|---|
| A placed prop | `Assets/props/<name>/<name>.asset.js` | Asset + prop recipe / primitive + `loadPropAssets` |
| A grid/floor visual | Owning sandbox/floor module + `Canvas/QuantizedSpriteCache.js` | Cached grid stamp recipe |
| Editor or sandbox feedback | `Libraries/Render/overlays` + `SandboxEditor/buildSandboxOverlayCommands.js` | Overlay commands |
| Path search behavior | `Libraries/Pathfinding` | A*, HPA, flow, worker sessions |
| Runtime nav wiring | `Libraries/Navigation` | `NavRuntime`, `NavTopology`, worker navigation factory |
| Agent memory | `Libraries/AI/brain` or `Libraries/AI/memory` | Spatial cells vs entity targets |
| Agent scoring / decisions | `Libraries/AI/utility`, `Libraries/AI/eqs`, domain adapter | Generic scoring core, domain-specific facts/scorers |
| Snake game behavior | `Libraries/Game/snake` | Snake adapter over generic AI/nav/physics |
| Surface texture/theme | `Libraries/Procedural/Motifs` + `Config/procedural/storage` | Motif + profile preset |
| Level/room geometry | `Libraries/RoomGraph`, `Libraries/CA`, `Libraries/Procedural/Mazes` | Room graph bake / maze helpers |
| Physics joints/constraints | `Libraries/Motion/kineticConstraints*.js` | PGS constraint solver |

---

*Last updated: current engine audit after generic AI utility scoring, target memory, EQS option scoring, effort-aware snake decisions, and nav runtime/topology split. Linked from [ROADMAP.md](./ROADMAP.md) §6.*
