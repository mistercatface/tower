# Library audit — current map of the codebase

This is the cross-cutting index for the engine. It answers three questions:

- **Where does this concern live?**
- **Is this engine/library code, sandbox tooling, or snake-game-specific code?**
- **Is the overall shape healthy?** → [foundations/architecture-health.md](./foundations/architecture-health.md)

Spoke docs stay authoritative for feature progress: [physics](./physics.md), [pathfinding](./pathfinding.md), [rendering](./rendering.md), [procedural](./procedural.md), [Mazes](./Mazes.md), and [AI](./AI.md). This audit keeps the folder map current.

**Legend:** ✅ shipped and wired · 🟡 partial / scaffolding · ⬜ inert or not behaviorally wired · 🔗 cross-cutting foundation.

---

## 1. Naming traps

→ **[glossary.md](./glossary.md)** — canonical list (procedural×3, voxel vs rail, code paths). Don't duplicate here.

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
| `Libraries/Spatial/collision` | ✅ | Broadphase snapshots, SAT/circle narrow phase (including `SatCollision.js`, `wallResolution.js`, `WallGeometry.js`), contact solve, side-effect hooks |
| `Libraries/Spatial/indexes` | ✅ | Uniform-grid broadphase (`EntityGrid`), `CellPropIndex` |
| `Libraries/Spatial/world` | ✅ | `SpatialFrameCore` frame/candidate cache shared by world systems |
| `Libraries/Props` | ✅ | `worldPropPool.js` object cache/pooling for dynamic props |
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
| `Libraries/AI/agentIntent` | ✅ | Generic flat agent intent FSM host (`AgentIntent.js`) |
| `Libraries/AI/identity` | ✅ | `agentIdentity.js` named agent and identity management |
| `Libraries/AI/agents` | ✅ | `AgentProfiles.js` profile ids/registry/engagement and `AgentDecisionContext.js` schema-driven facts/scoring |
| `Libraries/AI/brain` | ✅ | Spatial memory and memory-to-A* penalty producer |
| `Libraries/AI/perception` | ✅ | Shared world perception and agent vision classification |
| `Libraries/AI/steering` | ✅ | Flee-cell and combat-strafe cell scoring |
| `Libraries/AI/utility` | ✅ | Generic utility/net-value candidate scoring |
| `Libraries/AI/eqs` | ✅ | Tiny EQS-style weighted option scoring |
| `Libraries/Agent` | ✅ | Agent pose / steering result contracts |
| `Libraries/FSM` | 🟡 | Generic transition helper, separate from agent intent |

Current proving ground: snake game profiles (`snake`, `flee_agent`, `squid`). Target memory is currently owned by the snake-game adapter (`GroundNavIntentAdapter.js`), not a standalone `Libraries/AI/memory` package.

### 3.4 Rendering and presentation

| Path | State | Role |
|---|---|---|
| `Libraries/Render/Props3D` | ✅ | Prop meshes, projection, face culling, primitive renderers |
| `Libraries/Render/Structure3D` | ✅ | Voxel wall atlas and rail edge rendering |
| `Libraries/Render/overlays` | ✅ | Overlay command pipeline for editor/sandbox feedback |
| `Libraries/Render/losShadow` | ✅ | Real-time stencil-based LOS shadow overlay and edge collection |
| `Libraries/Render/SurfaceTexturing` | ✅ | Sphere/cell/decal texture patches |
| `Libraries/Render` | ✅ | Scene assembly, prop draw entry (with drawProjectile), vector mode, map caches |
| `Libraries/Canvas` | ✅ | Quantized sprite cache, baked cache, affine texture, offscreen canvas |
| `Libraries/Spatial/elevation` | ✅ | Radial elevation projection (`RadialElevationProjection.js`), shadow math (`shadowProjection.js` still unwired) |
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

→ **[sandbox-editor.md](./sandbox-editor.md)** — TileLab vs game shell, controller, inspectors, persistence.

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

→ **[games/snake.md](./games/snake.md)** — species, session, intent stack, engagement, HUD/overlays, config, extracted vs game-specific.

Condensed file map (detail in snake doc):

| Path | Role |
|---|---|
| `Libraries/Game/snake/setupSnakeGame.js` | game launch setup, HUD, scene tick hook |
| `Libraries/Game/snake/snakeAgentSession.js` | session, dynamic species map, frame orchestrator |
| `Libraries/Game/snake/AgentInstance.js` | runtime instance, autosim, metabolism, relationships |
| `Libraries/Game/snake/GroundNavIntentAdapter.js` | target memory, FSM adapter, ranged combat action state |
| `Libraries/Game/snake/snakeCombat.js` | contact combat / ram rules |
| `Libraries/Game/snake/gunAgent/gunBulletSystem.js` | projectile sim and contacts |
| `Config/games/snake.js` | profile schemas and gameplay tuning |

---

## 5. Test coverage map

| Subsystem | Representative tests |
|---|---|
| Physics / kinetic | `kineticConstraintSolver`, `kineticContactSolver`, `kineticNarrowPhase`, `kineticPairStream`, `kineticIslands`, `kineticSleepProps`, `kineticContactManifold`, `activeKineticBodies`, `bodyMass`, `wallResolution`, `chainLinks`, `chainVsWallGrowth` |
| Pathfinding / nav | `AStar`, `hpaGroundNavReplan`, `hpaPathSlot`, `hpaStitch`, `hpaRegionGraph`, `gridNavContext`, `hpaBeltNav`, `flowFieldBfs`, `lineOfSight`, corridor tests |
| AI / decisions | `brain`, `navStepPenalty`, `utilityScoring`, `eqsScoreOptions`, `goalSeekAutosim`, `gridCellVision`, `agentFrameOrchestrator`, `fleeAgentDecision`, `agentRelationships` |
| Snake game | `snakeDecisionModel`, `snakeIntent`, `snakeFsmTransitions`, `snakeAutosim`, `snakeInstance`, `snakeMulti`, `snakePerfBudget`, `snakeMinLengthDeath`, `snakeSplit`, `snakeSegmentFracture`, `snakeStarvation`, `fleeAgentCombat`, `fleeAgentCallouts`, `ammoEconomy`, `gunBullet`, `createAgentSpecies`, `squidVsSquidCombat`, `squidVsFleeCombat`, `shatterPerformance` |
| Procedural / mazes | `puzzleTemplateBeltCrate`, `lockedRoom`, `railMaze*`, `snakeSplitLayout`, `walkableCells`, `navWalkableIndex` |
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
| Agent memory | `Libraries/AI/brain` or the domain adapter | Spatial cells vs entity targets |
| Agent scoring / decisions | `Libraries/AI/agents/AgentDecisionContext.js`, `Libraries/AI/utility`, `Libraries/AI/eqs`, domain adapter | Generic scoring core, profile/domain facts |
| Snake game behavior | `Libraries/Game/snake` | See [games/snake.md](./games/snake.md) |
| Surface texture/theme | `Libraries/Procedural/Motifs` + `Config/procedural/storage` | Motif + profile preset |
| Level/room geometry | `Libraries/RoomGraph`, `Libraries/CA`, `Libraries/Procedural/Mazes` | Room graph bake / maze helpers |
| Physics joints/constraints | `Libraries/Motion/kineticConstraints*.js` | PGS constraint solver |

---

*Last updated: Current engine audit updated with `AgentProfiles`, `AgentDecisionContext`, `GroundNavIntentAdapter`, flee gun/ammo economy, squid, and frame orchestration.*
