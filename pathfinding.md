# Pathfinding engine — research tree

Progress tracker for the navigation stack: grid topology → A* → HPA* abstraction → flow fields → off-thread workers → dynamic replanning → steering. Read top-to-bottom like a tech tree: later tiers assume earlier ones. Percentages are **honest engineering completion** (working, wired, exercised) — not "we touched a file once."

**Legend:** ✅ shipped · 🟡 partial · ⬜ not started · 🔜 planned (named PR set)

**Overall engine maturity:** ~**55%** of a full multi-agent navigation engine. The *planning core* (A*, HPA*, flow fields, off-thread SAB workers, incremental replan) is genuinely production-grade — arguably the strongest part of this codebase. The gap to a pro stack is almost entirely **navmesh + crowd/local-avoidance + path smoothing**, not the search layer.

---

## Where this sits vs a professional nav stack

This is a **grid-based hierarchical planner**, not a navmesh-based crowd engine. That's an architectural choice, not a deficiency — but it's the honest frame for the percentages below.

| Capability | This engine | Recast/Detour · Unreal Nav · Unity NavMesh |
|---|---|---|
| Spatial representation | Uniform octile grid (16 px cells) | Polygon **navmesh** from geometry voxelization |
| Hierarchical abstraction | ✅ HPA* Voronoi regions + CSR abstract graph | Detour tiles / hierarchical A* (DotRecast `dtNavMeshQuery`) |
| Long-range search | ✅ abstract A* + local stitch | `findPath` over poly graph |
| Flow / many-agents-one-goal | ✅ rolling-window flow field worker | Usually per-agent paths; flow fields are bespoke |
| Off-thread planning | ✅ Web Workers + SharedArrayBuffer slot pools | Background tasks / job system |
| Incremental dynamic obstacles | ✅ epoch invalidation + localized region patch | Detour **tile cache** rebuild + temporary obstacles |
| Local avoidance (crowd) | ⬜ none (grid blocking only) | ✅ **RVO / ORCA** detour crowd |
| Path smoothing | ⬜ raw grid waypoints | ✅ funnel / string-pull |
| Variable agent radius | ⬜ single grid | ✅ per-agent radius (multiple navmeshes / erosion) |
| Off-mesh / jump links | ⬜ (passage edges only) | ✅ off-mesh connections |
| Area costs / weighted regions | 🟡 belts bias, no general cost field | ✅ area flags + cost modifiers |

**Takeaway:** the search and worker architecture is at or above hobby-engine parity; what separates it from Recast/Detour is the **representation (grid vs mesh)** and the **agent layer (no crowd/avoidance/smoothing)**.

---

## Tree overview

```mermaid
flowchart TB
    subgraph T0["Tier 0 — Grid & topology"]
        A0[WorldObstacleGrid]
        A1[canStep / edge barriers]
        A2[Octile topology bake]
        A3[Nav epoch / cache key]
    end
    subgraph T1["Tier 1 — Core search"]
        B0[Grid A* octile]
        B1[Cardinal A*]
        B2[Abstract CSR A*]
        B3[Min-heaps]
    end
    subgraph T2["Tier 2 — HPA* abstraction"]
        C0[Distance transform]
        C1[Voronoi regions]
        C2[Region adjacency graph]
        C3[Flat CSR pack]
    end
    subgraph T3["Tier 3 — Flow fields"]
        D0[Backward BFS]
        D1[Rolling window]
        D2[Direction sampling]
    end
    subgraph T4["Tier 4 — Off-thread workers"]
        E0[SAB slot host]
        E1[HPA worker]
        E2[Flow worker]
    end
    subgraph T5["Tier 5 — Dynamic replanning"]
        F0[NavigationService]
        F1[Incremental graph patch]
        F2[Replan policy]
    end
    subgraph T6["Tier 6 — Follow & steer"]
        G0[Waypoint follow]
        G1[Roll actuator / arrival]
        G2[Flow / direct steer]
    end
    subgraph T7["Tier 7 — Local avoidance"]
        H0[Separation]
        H1[RVO / ORCA]
        H2[Path smoothing]
    end
    subgraph T8["Tier 8 — Static world"]
        I0[Walls / rail edges]
        I1[Belts]
        I2[Passage power]
    end
    subgraph T9["Tier 9 — Corridor routing"]
        J0[Room corridor solver]
    end
    subgraph T10["Tier 10 — Gameplay"]
        K0[Ground nav modes]
        K1[Chain head nav]
        K2[Snake autosim]
    end

    A0 --> A1 --> A2 --> A3
    A2 --> B0 --> B2
    B0 --> C0 --> C1 --> C2 --> C3
    A2 --> D0 --> D1 --> D2
    C3 --> E1
    A3 --> F0 --> F1
    E1 --> F2 --> G0 --> G1
    D2 --> G2
    G1 -.-> H0
    I0 --> A1
    I1 --> G0
    J0 --> I1
    F2 --> K1 --> K2
```

---

## Tier 0 — Grid model & topology

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| `WorldObstacleGrid` (walls/floors/edges) | ✅ | 90 | `Libraries/Spatial/grid/WorldObstacleGrid.js`, 16 px cells, 150×150 |
| `isBlocked` voxel walls | ✅ | 90 | Uint8 `grid[]`, height-level stamps |
| `canStep` + edge barriers | ✅ | 85 | rail walls, passages, belt rails via `edgeStore` |
| Vertex passability (diagonal corner check) | ✅ | 85 | `vertexPassability.js`, no corner-cutting |
| Octile topology bake (neighbors + predecessors) | ✅ | 85 | `navTopologySab.js`, packed to SAB |
| Edge pool serialization | ✅ | 80 | `navEdgePoolSab.js` |
| Nav epoch / cache key invalidation | ✅ | 85 | `gridNavEpoch.js`, `gridTopologyEpoch`, floor/passage channels |
| Grid expand / remap (`expandToCoverAabb`) | ✅ | 75 | bumps topology epoch |
| Kinetic props as dynamic obstacles | ⬜ | 0 | balls/crates **not** written to nav grid (chain can clip — `chainVsWallGrowth.test.js`) |
| Variable agent radius / grid erosion | ⬜ | 0 | single shared grid, point-agent assumption |

**Branch progress: 78%**

---

## Tier 1 — Core search (A*)

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Grid A* (8-connected octile) | ✅ | 90 | `runLocalAStarFlat`, `AStar.js` |
| Cardinal A* (4-connected, no cut) | ✅ | 90 | `runCardinalAStarFlat`, corridor routing |
| Abstract CSR graph A* | ✅ | 85 | `runAbstractAStarFlat`, region graph |
| Indexed min-heap (`IdxMinHeap`) | ✅ | 90 | `DataStructures/MinHeap.js`, f-score arrays |
| Scratch reuse + `runId` visited stamps | ✅ | 85 | no per-search alloc on worker |
| Octile / Manhattan heuristics | ✅ | 85 | admissible, tie-aware offsets |
| Path-length caps (`maxPathLen`) | ✅ | 80 | `HPA_LOCAL_MAX_LEN = 96`, fail-loud over cap |
| Jump Point Search (JPS) | ⬜ | 0 | not implemented (HPA covers long-range instead) |
| Weighted / area-cost search | ⬜ | 0 | uniform step cost only |

**Branch progress: 78%**

---

## Tier 2 — HPA* hierarchical abstraction

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Distance transform (octile BFS from walls) | ✅ | 85 | `computeDistanceTransform`, `VoronoiRegions.js` |
| Voronoi region flood-fill clustering | ✅ | 85 | `generateVoronoiRegions`, cap `maxCellsPerChunk = 64` |
| Small-region merge | ✅ | 80 | `mergeSmallRegions`, min 8 cells |
| Region adjacency detection | ✅ | 85 | `findRegionAdjacencies`, cardinal boundary scan |
| Inter-region edges (chebyshev cost) | ✅ | 80 | `connectRegionPair` |
| Edge validation vs real `canStep` | ✅ | 80 | `validateRegionEdges` — belts/forcefields honored |
| Flat CSR pack for worker (`cellToRegion`) | ✅ | 85 | `packRegionGraphFlat`, Int16 arrays |
| Temp start/target node injection | ✅ | 80 | `hpaReplanPrep.js`, local connect legs |
| Abstract path → cell stitch | ✅ | 80 | `stitchAbstractCellPath`, per-leg local A* |
| Local-vs-HPA mode selection | ✅ | 80 | `hpaPathRequest.js`, 32-cell threshold |
| Graph node cap | ✅ | 75 | `MAX_HPA_GRAPH_NODES = 4096` (throws over) |
| Multi-level hierarchy (3+ tiers) | ⬜ | 0 | single abstraction level only |
| Precomputed intra-region distances | 🟡 | 40 | recomputed per stitch, not cached |

**Branch progress: 73%**

---

## Tier 3 — Flow fields

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Backward BFS from goal | ✅ | 85 | `computeFlowField`, `flowFieldBfs.js` |
| Reverse octile-predecessor adjacency | ✅ | 80 | shares HPA blocked + predecessor SABs |
| Rolling window (recenter on move) | ✅ | 80 | `flowFieldWindow.js`, `FlowFieldGrid.js` |
| 9-direction byte encoding | ✅ | 85 | `sampleFlowDirection.js`, 255 = unreachable |
| Bilinear direction sampling | ✅ | 80 | `decodeFlowFieldCell`, smooth-ish desired dir |
| Flow → steering | ✅ | 80 | `flowSteering.js`, `computeFlowFieldSteering` |
| Target field cache | ✅ | 75 | `MAX_CACHE = 100` goal slots |
| Range-limited fields | ✅ | 70 | optional BFS `range` cap |
| Reachability check | ✅ | 75 | `gridReachabilityBfs.js` |
| Integration/cost-field blending | ⬜ | 0 | direction only, no potential-field cost blend |

**Branch progress: 78%**

---

## Tier 4 — Off-thread worker architecture

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Generic SAB slot worker host | ✅ | 85 | `SabSlotWorkerHost.js`, requestId/readyId handshake |
| HPA worker entry | ✅ | 85 | `HpaWorkerEntry.js`, topology + graph + replan |
| Flow field worker entry | ✅ | 85 | `FlowFieldWorkerEntry.js` |
| SharedArrayBuffer pools (paths/graph/cell→region) | ✅ | 85 | `hpaWorkerSab.js`, growable cell→region |
| Slot leasing (512 in-flight) | ✅ | 85 | `MAX_HPA_REPLAN_SLOTS`, lease/release |
| Async wait (HPA) + poll (flow) | ✅ | 80 | `waitForSlot` Promise vs `isReady` |
| Message protocol (init/buildNav/patch/replan) | ✅ | 85 | clean staged pipeline, trace-visible |
| Worker restart / crash recovery | ⬜ | 0 | `graphPatchError` logs only, no respawn |
| Worker pool scaling (N workers) | ⬜ | 0 | single HPA + single flow worker |

**Branch progress: 77%**

---

## Tier 5 — Dynamic obstacles & replanning

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| `NavigationService` obstacle sync | ✅ | 85 | `Systems/Navigation/NavigationService.js` |
| `onObstaclesChanged(damageBounds)` | ✅ | 85 | bumps `obstacleGeneration`, invalidates flow |
| Full region graph rebuild | ✅ | 85 | on topology epoch / empty bounds |
| Incremental localized patch | ✅ | 80 | `rebuildDamagedRegionGraph`, 12-cell pad |
| Unreachable region prune | ✅ | 70 | BFS reachability from seed point |
| Per-entity replan policy | ✅ | 85 | `hpaReplanPolicy.js`, epoch/target/stuck/off-path |
| Stuck detection | ✅ | 80 | `stuckReplanFrames = 20`, < 1.5 px movement |
| Off-path replan w/ cooldown | ✅ | 80 | `REPLAN_OFF_PATH_COOLDOWN_MS = 250` |
| Visibility gating (defer off-screen) | ✅ | 75 | off-screen entities wait unless stuck |
| Request coalescing + priority tiers | ✅ | 80 | `HpaPathSession.js`, supersede in-flight |
| Passage-power dynamic edges | ✅ | 75 | button hold toggles passability → resync |
| Detour-style temporary obstacle carve | ⬜ | 0 | obstacles are grid edits, not runtime cylinders |
| Fallback path on planner failure | ⬜ | 0 | clears path by design (no degraded mode) |

**Branch progress: 73%**

---

## Tier 6 — Path following & basic steering

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Waypoint following (SAB path) | ✅ | 80 | `computeSabPathSteering`, `hpaPathSlot.js` |
| Progress index + arrival advance | ✅ | 80 | `PATH_WAYPOINT_ARRIVAL_PX = 16` |
| Off-path detection | ✅ | 80 | `pathOffPathDistance = 80` |
| Roll actuator (accel-limited velocity) | ✅ | 80 | `kineticRollActuator.js`, `steerRollToward` |
| Arrival / stop radius | ✅ | 80 | `stopRadius`, `decelerateRoll` |
| Flow-field steering | ✅ | 80 | `flowGroundNavBehavior.js` |
| Direct seek (no planning) | ✅ | 85 | `directGroundNavBehavior.js` |
| Belt entry-snap + on-belt handoff | ✅ | 70 | `resolveFloorBeltSteerTarget`, yields to belt physics |
| Velocity-aware steering | 🟡 | 30 | `agentPose` carries vx/vy but steer ignores it |
| Path smoothing (funnel / string-pull) | ⬜ | 0 | raw grid-cell waypoints |
| Lookahead / spline follow | ⬜ | 0 | single-waypoint seek |

**Branch progress: 66%**

---

## Tier 7 — Local avoidance & crowd (biggest gap)

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Multi-agent grid blocking | 🟡 | 30 | agents don't block each other's grid; rely on physics contact |
| Separation steering | ⬜ | 0 | none in nav layer |
| Collision avoidance (predictive) | ⬜ | 0 | no velocity obstacles |
| RVO / ORCA crowd solver | ⬜ | 0 | the headline pro-engine feature missing |
| Boids / flocking | ⬜ | 0 | |
| Local obstacle avoidance beyond grid | ⬜ | 0 | grid blocking only |
| Agent priority / right-of-way | 🟡 | 20 | only replan priority tiers, not motion yield |

**Branch progress: 11%**

---

## Tier 8 — Static environment integration

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Voxel walls → blocked cells | ✅ | 90 | `stampStaticWalls`, scene voxels |
| Rail wall edges → `canStep` | ✅ | 80 | `setBoundary`, `commitBoundaryEdit` |
| Floor belts (nav-aware) | ✅ | 70 | `FloorCell.js`, entry/exit snap |
| Belt rail lateral barriers | ✅ | 70 | `syncFloorBeltRailEdges` |
| Passage power network | ✅ | 75 | `syncPassagePowerNetwork`, dynamic seal/unseal |
| Forcefields / one-way | 🟡 | 40 | grid stamps, partial nav honoring |
| Single-cell belt edit → nav resync | 🟡 | 50 | may skip `onObstaclesChanged` until next wall sync |
| Line-of-sight queries | ✅ | 70 | `lineOfSight.test.js`, wall proxies (not HPA) |

**Branch progress: 66%**

---

## Tier 9 — Corridor / procedural routing

Separate from runtime entity nav — used for **room-graph corridor authoring** (cardinal A* through wall holes).

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Cardinal grid pathfinder (reserved footprints) | ✅ | 80 | `corridorGridPathfinder.js` |
| Corridor width footprints | ✅ | 80 | `corridorFootprint.js`, overlap checks |
| Lane routing through wall holes | ✅ | 75 | `corridorLanePath.js` |
| Multi-corridor bundle solver | ✅ | 75 | `corridorBundle.js`, parent/child rooms |
| Wall hole slot enumeration | ✅ | 75 | `corridorWallSlots.js`, spread selection |
| Room interior blocked grids | ✅ | 75 | `corridorWalkGrid.js` |
| Corridor → belt bake | ✅ | 70 | `roomGraphCorridorBelts.js` |
| Unify with runtime HPA (octile) | ⬜ | 0 | intentional split (cardinal vs octile) |

**Branch progress: 74%**

---

## Tier 10 — Gameplay (navigation payoff)

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| Three ground-nav modes (direct/flow/HPA) | ✅ | 85 | `groundNav/`, selection menu |
| Pointer-drag nav to cursor | ✅ | 80 | `issueGroundNavToSelection.js` |
| Chain head steering (tail follows) | ✅ | 80 | `chainLinks.js`, head-only nav target |
| Goal-seek autosim | ✅ | 85 | `goalSeekAutosim.js`, set target per goal |
| Snake autosim (head → food → grow) | ✅ | 90 | `Libraries/Game/snake/`, HPA nav |
| Multi-snake concurrent seekers | ✅ | 80 | `snakeMulti.test.js`, nav/worker stress |
| Open-cell goal placement | ✅ | 80 | `pickOpenCavernCell`, blocked-aware |
| Crowd / formation movement | ⬜ | 0 | depends on Tier 7 |

**Branch progress: 75%**

---

## Tier 11 — Tooling, debug & tests

| Item | Status | % | Notes / modules |
|------|--------|---|-----------------|
| SAB path overlay (debug draw) | ✅ | 75 | `buildSabPathOverlayFromProgress` |
| Abstract path overlay | ✅ | 70 | `buildSabAbstractPathOverlay` |
| Replan policy unit tests | ✅ | 80 | `hpaGroundNavReplan.test.js` |
| Corridor solver tests (seeds/widths) | ✅ | 80 | `corridorWidthOne/MultiLane.test.js` |
| Snake / autosim tests | ✅ | 80 | `snakeAutosim`, `snakeMulti`, `goalSeekAutosim` |
| Belt cell detection test | 🟡 | 40 | `hpaBeltNav.test.js` — on/off only, not E2E |
| Locked-room / passage nav tests | ✅ | 70 | `lockedRoom.test.js` |
| A* unit tests | ⬜ | 0 | no direct `AStar.js` coverage |
| Region graph build tests | ⬜ | 0 | no `hpaRegionGraph` unit test |
| Flow field BFS tests | ⬜ | 0 | no `flowFieldBfs` unit test |
| Worker E2E (real worker replan) | ⬜ | 0 | tests mock the worker |

**Branch progress: 55%**

---

## Tier 12 — Advanced (future / out of scope for now)

| Item | Status | % |
|------|--------|---|
| Polygon navmesh generation (Recast-style) | ⬜ | 0 |
| Detour tile cache + temporary obstacles | ⬜ | 0 |
| RVO / ORCA crowd simulation | ⬜ | 0 |
| Off-mesh / jump links | ⬜ | 0 |
| Per-agent radius / multiple navmeshes | ⬜ | 0 |
| Weighted area costs / cost modifiers | ⬜ | 0 |
| Hierarchical multi-level (3+) abstraction | ⬜ | 0 |
| 3D / multi-floor navigation | ⬜ | 0 |
| Deterministic replay of nav decisions | ⬜ | 0 |

**Branch progress: 0%**

---

## What's genuinely pro-grade here

Three things in this stack are at or above what most indie/hobby engines ship:

1. **Off-thread planning with SharedArrayBuffer.** The HPA worker bakes topology, builds the region graph, and runs all A* off the main thread, writing results into shared slots with a clean lease/handshake protocol. Many engines never get planning off the main thread.
2. **Incremental hierarchical replan.** Localized region-graph patching (`rebuildDamagedRegionGraph`) instead of full rebuilds, plus epoch-driven invalidation and per-entity replan gating — this is the same shape as Detour's tile cache philosophy.
3. **Flow fields *and* HPA* on a shared topology.** Both consume the same packed octile predecessor SABs, so many-agents-one-goal (flow) and single-agent long-range (HPA) coexist without duplicate topology.

## What separates it from a pro stack

1. **Grid, not navmesh** — uniform 16 px cells; no polygon mesh, no agent-radius erosion, no off-mesh links.
2. **No crowd layer** — zero local avoidance (RVO/ORCA/separation). Agents only "avoid" via rigid-body contact, which is physics, not navigation.
3. **No path smoothing** — agents follow raw grid-cell centers; no funnel/string-pull, so paths look blocky.

---

## Recommended next unlocks (short path)

1. **Path smoothing (funnel / string-pull)** — biggest visual/feel win for the least work; post-process the octile cell path before follow.
2. **Local separation steering** — first slice of Tier 7; cheap neighbor query + push-apart desired-velocity blend. Unblocks believable multi-snake / crowd movement.
3. **A* / region-graph / flow-field unit tests** — Tier 11 has integration gaps; the search core has no direct coverage.
4. **Single-cell belt edit → guaranteed nav resync** — close the Tier 8 partial so editor belt placement always patches the graph.
5. **Worker resilience** — recover from `graphPatchError` instead of log-only.

---

## Key file map

```
Libraries/Pathfinding/              — A*, HPA*, flow fields, sessions, SAB
  AStar.js                          — grid + abstract A* (heaps, octile/cardinal)
  hpaRegionGraph.js, VoronoiRegions.js — region clustering + abstract graph
  HpaPathWorker.js, HpaPathSession.js  — worker host + per-entity replan
  hpaPathSlot.js                    — path follow / waypoint steering (not pathFollow.js)
  FlowFieldGrid.js, flowFieldBfs.js — flow field manager + BFS
  navTopologySab.js, hpaWorkerSab.js — SharedArrayBuffer topology/pools
  hpaReplanPolicy.js                — replan triggers, stuck, priority
  Corridor/                         — room-graph corridor routing (cardinal A*)
Libraries/Workers/Navigation/       — HpaWorkerEntry.js, FlowFieldWorkerEntry.js
Libraries/Sandbox/groundNav/        — direct / flow / HPA ground-nav behaviors
Libraries/Sandbox/kineticRollActuator.js — the one movement actuator
Libraries/Spatial/grid/WorldObstacleGrid.js — nav grid, canStep, epochs
Systems/Navigation/NavigationService.js — obstacle sync orchestration
Libraries/Game/snake/               — snake autosim (HPA head nav)
tests/hpaGroundNavReplan.test.js, corridor*.test.js, snake*.test.js
```

---

*Last updated: initial pathfinding tree (mirrors `physics.md` after trilogy B). Planning core is the mature half; Tier 7 local avoidance + path smoothing are the headline gaps to a Recast/Detour-class stack. Revisit percentages when smoothing or a crowd layer lands.*
