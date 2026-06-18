# Library audit — what's in what state, and where it lives

The **map of record** for the codebase: every major folder, what it actually *is*, which roadmap doc **owns** it, and its state. This is the doc to open when you're asking *"where does X live?"* or *"wait, what is this folder?"* — the engine has several **name collisions** (a folder called `Procedural` that makes textures, an `IsometricProjection` that isn't isometric) and this is where they get untangled.

> **Companion to:** [ROADMAP.md](./ROADMAP.md) §6 (condensed table). This file is the **expanded** version. Spoke file maps ([physics](./physics.md) · [pathfinding](./pathfinding.md) · [rendering](./rendering.md) · [procedural](./procedural.md) · [AI](./AI.md)) stay authoritative for *their* domain; this doc is the cross-cutting index.

**Legend:** ✅ shipped & wired · 🟡 partial / scaffolding · ⬜ stub / inert · 🔗 cross-cutting foundation (no single owner).
**Owner doc** = which roadmap doc tracks this code's *feature progress* (one owner per concern; see §1).

---

## 1. Naming traps — read this first

These are the collisions that make the tree confusing. Each row: the name you see, what it **actually** is, and where the *other* meaning lives.

| You see… | It **actually** is… | The other meaning lives in… |
|---|---|---|
| `Libraries/Procedural/` | **Surface-texture synthesis** (Perlin/Voronoi/motifs → pixel art for walls/floors) | Level/world *geometry* gen → `Libraries/CA/`, `Libraries/RoomGraph/` (owner: `procedural.md`) |
| `Spatial/iso/IsometricProjection.js` | **Camera-relative radial elevation** projection (viewer-relative lean) | True fixed isometric — *doesn't exist*; "iso" here means "elevation" (owner: `rendering.md`) |
| `prop.strategy` (`propStrategy.js`) | **WorldProp capability/config** pattern (collision shape, render key, sprite buckets) | AI strategy (GOAP/objectives) — *doesn't exist* (`AI.md` Tier 8) |
| `goal` (`goalSeekAutosim`, `snakeGoals`) | A **navigation destination** (where to move) | AI *objective* (what to accomplish) — *doesn't exist* |
| `Libraries/FSM/transition.js` | **Generic** enter/exit transition infra (used for prop lifecycle) | The snake's AI intent FSM — hand-rolled inside `snakeAutosim.js`, **not** this folder (owner: `AI.md`) |
| `Libraries/AI/brain/` | The **real per-agent memory** (spatial LRU + nav penalty) — easy to miss | — (this *is* the AI memory; owner: `AI.md`) |
| `navStepPenalty.js` (×2) | `AI/brain/navStepPenalty.js` **builds** the penalty from memory; `Pathfinding/navStepPenalty.js` **consumes** it in A\* | Two halves of one feature — producer (AI) + consumer (pathfinding) |
| `Libraries/Navigation/` | **Perception + steering** for agents (vision cone, explore pick) | Path *algorithms* → `Libraries/Pathfinding/`; system *wiring* → `Systems/Navigation/` |
| `Libraries/Motion/` | **Integrator + solver** (forces, impulses, substeps, islands) | Collision *detection* → `Libraries/Spatial/collision/` |
| `Libraries/WorldSurface/` | **Chunk floor/wall texture-atlas baking** (worker-driven) | Per-prop sphere/decal texturing → `Render/SurfaceTexturing/`; texture *generators* → `Procedural/` |
| `Libraries/Sandbox/` | A **mixed bag** — behaviors, ground-nav, chains, floor FX, map-gen UI; spans 4 docs | See §3.6 for the per-concern split |

> **One-owner rule:** a concern is tracked by exactly **one** roadmap doc even if its code is split across folders. Perception code lives in `Libraries/Navigation/` but its *progress* is tracked in `AI.md`. The corridor solver lives in `Libraries/Pathfinding/Corridor/` but `procedural.md` only *calls* it. Cross-references use 🔗.

---

## 2. Repo top-level map

| Folder | Role | Owner doc(s) |
|---|---|---|
| `Apps/Editor/` | Editor shell, world mount, preview/draw passes, profile editor UI | tooling (🔗 rendering) |
| `Core/` | Engine settings + globals + event system (`GamePhysicsSettings`, `GamePerspective`, `EventSystem`) | 🔗 foundations |
| `Config/` | Game configs (`games/snake.js`), world config, procedural **profile presets** | per-domain |
| `Entities/` | `Entity.js`, `WorldProp.js` — the base entity + prop model | 🔗 (physics/render/AI all touch it) |
| `GameState/` | Registries + shared state + snapshots (`EntityRegistry`, `SharedGameState`, `sandboxEntityMeta`) | 🔗 foundations |
| `Systems/` | Per-frame system wiring (`World/KineticSpatialFrame`, `Navigation/NavigationService`) | physics + pathfinding |
| `Render/` | Top-level render loop + draw passes (`Render.js`, `RenderSprites`, `StructureDrawPass`) | rendering |
| `Libraries/` | **The engine** — almost all subsystem code (see §3) | all |
| `tests/` | `node --test` suites (see §5) | all |

---

## 3. `Libraries/` — per-subsystem audit

Grouped by **owner doc** so you can find the home of a concern, not just a file.

### 3.1 Physics & motion → [physics.md](./physics.md)

| Folder | State | Role | Key files |
|---|---|---|---|
| `Libraries/Motion/` | ✅ | Integrator + impulse solver + substeps + islands + sleep | `kineticPhysicsPass.js` (driver), `motionSubsteps.js`, `applyAcceleration.js`, `applyDamping.js`, `rigidBodyImpulse.js`, `kineticConstraintSolver.js`, `kineticConstraints.js`, `kineticIslands.js`, `bodyMass.js`, `WallCollisionResolver.js`, `*Defaults.js` |
| `Libraries/Spatial/collision/` | ✅ | Broadphase + narrowphase (SAT) + contact solve | `Broadphase.js`, `entityBroadphase.js`, `SatCollision.js`, `kineticNarrowPhase.js`, `kineticContactSolver.js`, `kineticPairStream.js`, `penetration.js`, `wallResolution.js`, `Shapes.js`, `overlap.js`, `collisionPipeline.js` |
| `Libraries/Spatial/geometry/` | ✅ | Wall geometry + swept circle | `WallGeometry.js`, `circleSweep.js` |
| `Libraries/Spatial/indexes/` | ✅ | Broadphase spatial hash | `EntityGrid.js` |

### 3.2 Pathfinding & navigation → [pathfinding.md](./pathfinding.md)

| Folder | State | Role | Key files |
|---|---|---|---|
| `Libraries/Pathfinding/` | ✅ | A\* (octile/cardinal/abstract), HPA\*, flow fields, sessions, replan | `AStar.js`, `FlowFieldGrid.js`, `flowFieldBfs.js`, `flowSteering.js`, `VoronoiRegions.js`, `hpaRegionGraph.js`, `hpaStitch.js`, `HpaPathSession.js`, `HpaPathWorker.js`, `navSession.js`, `navSimView.js`, `hpaReplanPolicy.js`, `gridReachabilityBfs.js`, `navStepPenalty.js` (consumer) |
| `Libraries/Pathfinding/Corridor/` | ✅ | Cardinal-A\* **corridor solver** (called by procedural bake) | `corridorGridPathfinder.js`, `corridorBundle.js`, `corridorLanePath.js`, `corridorFootprint.js`, `corridorWallSlots.js` |
| `Libraries/Workers/` | ✅ | SAB slot worker host + nav worker entries | `SabSlotWorkerHost.js`, `Navigation/HpaWorkerEntry.js`, `Navigation/FlowFieldWorkerEntry.js` |
| `Systems/Navigation/` | ✅ | Per-frame nav service wiring | `NavigationService.js` |

### 3.3 Rendering → [rendering.md](./rendering.md)

| Folder | State | Role | Key files |
|---|---|---|---|
| `Libraries/Render/Props3D/` | ✅ | Prop meshes + projection + face cull | `PropRenderer.js`, `propMesh.js`, `sphere.js`, `sphereMesh.js`, `SolidDraw.js`, `flipperPaddle.js`, `pipeElbow.js` |
| `Libraries/Render/Structure3D/` | ✅ | Voxel wall atlas + rail edges (building walls) | `StaticGridWallDraw.js`, `StaticGridEdgeRailDraw.js`, `ProjectedWallDraw.js`, `WallDrawContext.js` |
| `Libraries/Render/overlays/` | ✅ | Editor/sandbox overlay command pipeline | `overlayCommands.js`, `drawOverlayCommands.js`, `overlayGlyphBake.js`, `overlayCacheKeys.js`, `pathOverlayCommands.js` |
| `Libraries/Render/SurfaceTexturing/` | ✅ | Per-prop sphere/decal texture patches | `sphereSurface.js`, `drawSphereTexturePatch.js`, `texturedCells.js` |
| `Libraries/Render/` (root) | ✅ | Scene assembly + prop draw entry | `WorldSceneRenderer.js`, `drawWorldProp.js`, `vectorProp.js`, `conveyorDraw.js`, `buttonFloorDraw.js`, `goalStarDraw.js`, `FloatingText.js`, `map/labMapCaches.js` |
| `Libraries/Canvas/` | ✅ | Bake/quantize/LRU sprite cache + affine texture + offscreen | `QuantizedSpriteCache.js`, `BakedSpriteCache.js`, `SpriteCache.js`, `AffineTexture.js`, `viewQuantize.js`, `offscreenCanvas.js`, `maskCompositor.js` |
| `Libraries/Spatial/iso/` | ✅ | **Radial elevation** projection + camera + shadow math | `IsometricProjection.js` (radial, misnamed), `ElevationCamera.js`, `shadowProjection.js` (⬜ unwired), `perspectiveDefaults.js` |
| `Libraries/Viewport/` | ✅ | Pan/zoom transform + zoom limits | `index.js`, `zoomControl.js`, `zoomMappings.js` |
| `Libraries/WorldSurface/` | ✅ | Chunk floor/wall texture-atlas **baking** (worker-driven) | `WorldSurfaceEngine.js`, `WorldSurfacePainter.js`, `TileWorkerCoordinator.js`, `ChunkDrawPass.js`, `WallFaceColumns.js`, `animatedSurface*.js` |
| `Libraries/Color/` | ✅ | Prop tint / hue / brightness | `tintPresets.js`, `hueShift.js`, `brightness.js`, `visualOverride.js`, `hex.js` |
| `Render/` (top-level) | ✅ | Render loop + sprite/structure passes | `Render.js`, `RenderSprites.js`, `StructureDrawPass.js`, `SimulationViewport.js`, `WorldRenderMode.js` |

### 3.4 Procedural → [procedural.md](./procedural.md)

| Folder | State | Role | Key files |
|---|---|---|---|
| `Libraries/CA/` | ✅ | Cellular-automata cave carving | `cellularAutomata.js` |
| `Libraries/RoomGraph/` | ✅ | Room-graph model + bake-to-geometry + corridors + puzzle template | `roomGraphStore.js`, `roomGraphBake.js`, `roomGraphCorridorApply.js`, `roomGraphLinkCorridor.js`, `roomGraphCorridorTypes.js`, `roomGraphCorridorBelts.js`, `roomGraphClosedRooms.js`, `puzzleTemplateBeltCrate.js`, `roomGraphSnapshot.js` |
| `Libraries/Procedural/` | ✅ | ⚠️ **Texture synthesis, NOT geometry** (🔗 rendering Tier 8) | `SurfaceTextureComposer.js`, `MotifRegistry.js`, `Fields/DomainWarp.js`, `Fields/VoronoiEdge.js`, `Motifs/*` (per-motif generators), `Motifs/Filters/*` |
| `Config/procedural/` | ✅ | Named surface-**profile presets** + bootstrap | `profiles.js`, `profileIds.js`, `bootstrap.js`, `storage/*` (one file per theme: `neonWireframe`, `toxicSludge`, `cyberGrid`, …) |

### 3.5 AI → [AI.md](./AI.md)

| Folder | State | Role | Key files |
|---|---|---|---|
| `Libraries/AI/brain/` | ✅ | **Per-agent spatial memory** (recency LRU) + memory→A\* penalty **producer** | `createBrain.js`, `spatialCellMemory.js`, `navStepPenalty.js` (builder), `spatialCellMemoryOverlay.js` |
| `Libraries/Navigation/perception/` | ✅ | Vision cone + grid LOS — **drives decisions** | `gridCellVision.js`, `gridCellVisionOverlay.js` |
| `Libraries/Navigation/steering/` | ✅ | Frontier **explore** destination pick | `exploreSteering.js` |
| `Libraries/Sandbox/autosim/` | ✅ | Generic greedy goal-seek autosim | `goalSeekAutosim.js` |
| `Libraries/Game/snake/` | ✅ | **The intent FSM** (`seek`/`explore`) + brain wiring + goals + scene | `snakeAutosim.js` (FSM), `snakeBrain.js` (perception→memory→penalty), `snakeGoals.js`, `snakeScene.js`, `setupSnakeGame.js`, `snakeGameConfig.js`, `snake*Overlays.js` |
| `Libraries/FSM/` | 🟡 | Generic transition infra (**not** the snake FSM) | `transition.js` |
| `Libraries/Agent/` | ✅ | Pose + steering-result contracts | `types.js`, `create.js` |
| `Libraries/Sandbox/sandboxFaction.js` | ⬜ | Faction metadata + "Team" label (no gameplay logic) | — |

### 3.6 Sandbox & editor (mixed — spans multiple docs)

`Libraries/Sandbox/` is the **most cross-cutting folder**; here's the per-concern split:

| Sub-area | Owner doc | Files |
|---|---|---|
| Ground-nav behaviors | 🔗 pathfinding/AI | `groundNav/hpaGroundNavBehavior.js`, `groundNav/flowGroundNavBehavior.js`, `groundNav/directGroundNavBehavior.js`, `groundNav/hpaGroundNavSession.js` |
| Steering actuator | physics | `kineticRollActuator.js` |
| Prop behaviors | AI/gameplay | `behaviors/flipperBehavior.js`, `behaviors/spawnerBehavior.js`, `behaviors/cueStrikeBehavior.js`, `behaviors/dragLaunchFacingBehavior.js` |
| Chains / linked bodies | physics | `chainLinks.js`, `spawnLinkedBallChain.js` |
| Floor systems | gameplay/render | `floorOccupancy.js`, `floorEffects.js`, `floorButtons.js`, `floorBeltDefaults.js`, `drawForcefields.js`, `forcefieldPower.js`, `passagePowerNetwork.js` |
| Map-gen UI | procedural | `mapGenInspector.js`, `mapGenBounds.js`, `cavernFloorCells.js`, `sandboxRoomGraphSession.js` |
| Scene/snapshot/placement | 🔗 foundations | `sandboxScenePlaceables.js`, `sandboxSceneSnapshot.js`, `sandboxPlacedSpawn.js`, `index.js` |

`Libraries/SandboxEditor/` (tooling): controller + pointer tools + inspectors + overlay collection — `createSandboxController.js`, `sandboxPrimaryPointerTool.js`, `sandboxMarqueeTool.js`, `*WireTool.js`, `buildSandboxOverlayCommands.js`, `ui/sandbox*Inspector.js`.
`Libraries/UI/` (tooling): control widgets — `Component.js`, `controls/SliderControl.js`, `controls/SelectControl.js`, `paramFields.js`, `contextMenu.js`.

### 3.7 Cross-cutting foundations 🔗 (no single owner)

| Folder | Role | Key files |
|---|---|---|
| `Libraries/DataStructures/` | Heaps, BFS toolkit, LRU, packed keys, rects | `MinHeap.js`, `gridBfs.js`, `LruMap.js`, `CellKey.js`, `CellRect.js` |
| `Libraries/Spatial/grid/` | The **shared grid** — obstacle grid, cell edges, floor cells, nav epoch, SAB edge pool | `WorldObstacleGrid.js`, `CellEdge.js`, `CellEdgeStore.js`, `FloorCell.js`, `GridCoords.js`, `GridUtils.js`, `gridNavEpoch.js`, `navEdgePoolSab.js`, `gridCellTopology.js`, `wallGridBake.js` |
| `Libraries/Spatial/query/` | Raycasts + LOS (shared by physics, AI, editor) | `lineOfSight.js`, `circleCast.js`, `steppedCircleRayCast.js`, `SpatialQuery.js`, `wallSegmentQuery.js` |
| `Libraries/Math/` | Vectors, angles, polys, interpolation, seeded RNG | `Poly2D.js`, `Angle.js`, `Segment2D.js`, `Screen2D.js`, `Interpolate.js`, `SeededRng.js`, `hash.js` |
| `Libraries/Random/` | Seeded RNG + weighted pick | `seededRandom.js`, `weightedPick.js` |
| `Libraries/Config/` | Partial-config merge | `mergePartial.js` |
| `GameState/` | Registries + shared state + per-entity meta | `EntityRegistry.js`, `SharedGameState.js`, `SandboxWorldState.js`, `sandboxEntityMeta.js`, `GameState.js` |
| `Systems/World/` | Per-frame kinetic frame population | `KineticSpatialFrame.js`, `populateKineticFrame.js` |
| `Core/` | Settings + globals + events | `GamePhysicsSettings.js`, `GameCollisionSettings.js`, `GamePerspective.js`, `GameProceduralDesign.js`, `EventSystem.js`, `EventNames.js`, `engineGlobals.js` |

### 3.8 Props & assets (cross-cutting: physics shape + render recipe)

`Libraries/Props/` straddles physics (shape) and rendering (recipe): `propStrategy.js` (the capability pattern — **not** AI), `loadPropAssets.js`, `primitives/spherePrimitive.js`, `primitives/polygonPrimitive.js`, `propScale.js`, `propMotion.js`, `rollingMotion.js`, and fracture variants (`propFracture.js`, `poxelFracture.js`, `chunkFracture.js`, `glassFracture.js`). Placed-prop assets live in `Assets/props/*/*.asset.js`.

---

## 4. Test coverage map

| Subsystem | Tests |
|---|---|
| Physics | `kineticConstraintSolver`, `kineticContactSolver`, `kineticNarrowPhase`, `kineticPairStream`, `kineticIslands`, `kineticSleepProps`, `activeKineticBodies`, `bodyMass`, `wallResolution`, `chainLinks`, `chainVsWallGrowth`, `spawnLinkedBallChain` |
| Pathfinding | `hpaBeltNav`, `hpaGroundNavReplan`, `corridorMultiLane`, `corridorWidthOne`, `lineOfSight`, `segment2D`, `poly2D` |
| Rendering | `vectorProp`, `drawShapeParity`, `maskCompositor`, `propScale`, `colorVisualOverride`, `triWedgeProp`, `shapeFirstProps`, `spawnShapeFamily` |
| Procedural | `puzzleTemplateBeltCrate`, `lockedRoom`, `cavernFloorCells` |
| AI | `brain`, `navStepPenalty`, `snakeIntent`, `snakeAutosim`, `snakeMulti`, `goalSeekAutosim`, `gridCellVision`, `spatialCellMemoryOverlay` |
| Gameplay / fracture | `snakeHeadGameplay`, `snakeScale`, `snakeGameConfig`, `snakeGameHarness`, `goalOrb`, `gameLaunch`, `propFracture`, `poxelFracture`, `glassFracture`, `chunkFracture`, `worldPropPick`, `sandboxEditorInspector`, `sandboxSceneSnapshot` |

> **Coverage read:** physics, AI, and the snake game are the best-tested. Rendering leans on parity/snapshot tests. **Procedural layout** and **the projection/camera math** are the thinnest — consistent with their roadmap maturity.

---

## 5. "Where do I add X?" quick index

| I want to add… | Go to | Pattern / entry point |
|---|---|---|
| A placed prop (ball, crate, button) | `Assets/props/<name>/<name>.asset.js` + `Props/primitives/` | `loadPropAssets` → `PropRenderer.drawProp` (see `rendering-pipelines.mdc` §1) |
| A grid/floor visual (belt, forcefield) | colocated recipe + `Canvas/QuantizedSpriteCache.js` | `drawCachedPropSprite` + `GRID_STAMP_RENDER_KEY` (§2) |
| Editor/selection feedback | `Render/overlays/` + `SandboxEditor/buildSandboxOverlayCommands.js` | `append*OverlayCommands` (§4) |
| A pathfinding tweak | `Libraries/Pathfinding/` | `AStar.js` / `HpaPathSession.js` (🔗 worker: `Workers/Navigation/`) |
| A surface texture/theme | `Libraries/Procedural/Motifs/` + `Config/procedural/storage/` | `MotifRegistry` + a profile preset |
| Level/room geometry | `Libraries/RoomGraph/` + `Libraries/CA/` | `roomGraphBake.js` (corridors 🔗 `Pathfinding/Corridor/`) |
| An AI behavior/decision | `Libraries/Game/snake/snakeAutosim.js` (today) | the intent FSM — **generalize it** per `AI.md` next-unlock #1 |
| Agent perception/memory | `Libraries/Navigation/perception/` + `Libraries/AI/brain/` | `gridCellVision` → `createBrain` |
| A physics joint/constraint | `Libraries/Motion/kineticConstraints*.js` | PGS solver (distance joint is the template) |

---

*Last updated: PR2 — full per-file audit extracted from the live tree (~411 JS modules across `Libraries/` + 7 top-level dirs). Leads with the naming-traps table since collisions (`Procedural`=textures, `iso`=radial, split `navStepPenalty`, `FSM`≠snake FSM) are the main confusion source. Linked from [ROADMAP.md](./ROADMAP.md) §6. Revisit when folders move or a new subsystem lands.*
