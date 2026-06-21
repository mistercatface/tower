# Engine Roadmap

This is the hub for the 2D-canvas pseudo-3D sandbox engine. The spoke docs own domain detail; this file owns the dashboard, cross-engine comparison, cross-cutting foundations, and grab-list.

**Design constraints:** Canvas 2D only · single-threaded sim plus Web Worker offload · uniform grid as the shared substrate · bake-and-blit rendering caches · seeded determinism where wired.

**Legend:** ✅ shipped · 🟡 partial / scaffolding · ⬜ not started · ▶ next ship.

---

## 1. Maturity dashboard

| Subsystem | Maturity | Current state | CS core | ▶ Next ship | Doc |
|---|---:|---|---|---|---|
| **Physics** | ~75% | v1 rigid-body sandbox is maintenance-ready; warm-starting, islands, distance constraints, wall/fracture hooks | sequential impulse PGS, SAT, uniform-grid broadphase, island sleep | gameplay-driven joints / CCD only when needed | [physics.md](./physics.md) |
| **Pathfinding** | ~56% | pro-grade grid search + HPA/flow workers; missing smoothing and crowd layer | octile A*, HPA* Voronoi regions, flow-field BFS, SAB workers | funnel / string-pull smoothing | [pathfinding.md](./pathfinding.md) |
| **Rendering** | ~52% | radial pseudo-3D core is strong; no shadows/lighting pass yet | camera-relative elevation projection, painter sort, bake/blit LRU | projected drop shadows | [rendering.md](./rendering.md) |
| **Procedural** | ~42% | strong bake/resolution; weak authorship/generator layer | CA caves, room-graph bake, cardinal corridor A* | unified root seed | [procedural.md](./procedural.md) |
| **AI** | ~46% | generic intent host, spatial + target memory, utility scoring, EQS explore, snake 4-mode FSM | FSM, utility scoring, TTL target memory, scored EQS options, vision/LOS | second non-snake consumer or behavior-tree skeleton | [AI.md](./AI.md) |

**Overall engine maturity: ~54%** _(manual unweighted roll-up)._ The biggest recent shift is AI: snake is no longer just a game-specific experiment; several generic packages now live under `Libraries/AI`.

---

## 2. Engine vs professional baseline

### Simulation / physics

| Capability | This engine | Pro reference | Gap |
|---|---|---|---|
| Integration | ✅ semi-implicit Euler + fixed substeps | Box2D/Chipmunk standard | parity |
| Broadphase | ✅ uniform-grid spatial hash and id-ordered pair stream | SAP / dynamic BVH | grid clumps on uneven density |
| Narrow phase | ✅ SAT, circle fast lane, compound parts | SAT + GJK/EPA | no GJK/EPA distance |
| Contact solve | ✅ sequential impulse, friction, restitution, feature-id warm-start | PGS + block manifolds | limited multi-point manifold depth |
| Constraints | 🟡 distance constraints, chain links, island sleep | revolute/prismatic/weld/motor | only distance |
| CCD | ⬜ substeps only | TOI / conservative advancement | tunneling at high speed |

### Navigation / pathfinding

| Capability | This engine | Pro reference | Gap |
|---|---|---|---|
| Search | ✅ octile/cardinal/abstract A* | A* over navmesh graph | parity on grid |
| Hierarchy | ✅ HPA* Voronoi regions + CSR graph | Detour tiles | parity in grid representation |
| Many agents / one goal | ✅ flow fields | bespoke | strong |
| Concurrency | ✅ SAB workers + slot leases | job system | parity |
| Dynamic repair | ✅ epoch invalidation + localized region patch | tile-cache rebuild | parity |
| Runtime topology | ✅ `NavRuntime` + `NavTopology` + worker navigation | nav service / tile cache | current naming is now documented |
| Path smoothing | ⬜ raw cell centers | funnel / string-pull | top feel gap |
| Local avoidance | ⬜ physics contact only | RVO / ORCA | no crowd layer |
| Representation | 🟡 uniform grid | navmesh | no variable agent radius |

### AI / decision-making

| Capability | This engine | Pro reference | Gap |
|---|---|---|---|
| Control dispatch | ✅ per-entity behavior + generic agent intent host | controller / behavior component | good plumbing |
| Perception | ✅ vision cone + LOS driving decisions and nav memory | AI perception | sight only |
| Memory | ✅ spatial cell memory + TTL target memory | blackboard / target memory | no shared squad blackboard |
| FSM | ✅ generic host; snake uses explore, seek_food, seek_prey, flee | FSM / behavior tree | no hierarchy |
| Utility scoring | 🟡 generic score core; snake mode scoring uses value/reach/cost/net | utility AI | not broad action library yet |
| EQS | 🟡 generic option scorer; explore is first consumer | Unreal EQS | no authoring/debug UI |
| Teams/factions | 🟡 metadata and persistence | team-aware targeting | hostility rules absent |
| Strategy/game theory | ⬜ none | GOAP/HTN/MCTS/minimax | future |

### Rendering

| Capability | This engine | Pro reference | Gap |
|---|---|---|---|
| Projection | ✅ camera-relative radial elevation | fixed iso / 2.5D / raycaster | distinctive, not a gap |
| Depth | ✅ painter sort + per-face mesh sort | painter / z / BSP | no per-pixel z by design |
| Caching | ✅ quantized bake/blit LRU | atlas pipeline | parity |
| Texture | ✅ affine wall and prop surface texturing | sprite/sector texturing | affine only |
| Shadows/lighting | ⬜ shadow math exists, unwired | baked/contact shadows | biggest visual gap |
| Perspective modes | 🟡 radial full, flat2d partial | multiple modes | top-down/isometric incomplete |

### Procedural / level generation

| Capability | This engine | Pro reference | Gap |
|---|---|---|---|
| Cave carving | ✅ cellular automata | CA / random walk / noise | parity |
| Bake to geometry | ✅ room graph -> grid, rails, corridors, locks, puzzle template | tunnel/templates | strong |
| Maze helpers | ✅ rail/corridor/belt/split-layout helpers | maze post-processing | growing |
| Unified seed | 🟡 per-system seeds | master seed | root seed missing |
| Layout generator | ⬜ manual room placement | BSP / packing / MST / grammar | headline gap |
| Solvability/difficulty | ⬜ mechanism tests only | solver / difficulty estimator | future AI/procedural bridge |

---

## 3. Architecture map

```mermaid
flowchart TB
    subgraph foundations [Cross-cutting Foundations]
        grid["WorldObstacleGrid / epochs"]
        rng["Seeded RNG"]
        workers["SAB workers"]
        cache["Bake/blit caches"]
        snapshot["Snapshot schema"]
        tick["RAF sim/render split"]
    end

    physics[Physics]
    pathfinding[Pathfinding]
    rendering[Rendering]
    procedural[Procedural]
    ai[AI]
    sandbox[Sandbox]
    snake["Snake Game"]

    grid --> physics
    grid --> pathfinding
    grid --> procedural
    workers --> pathfinding
    cache --> rendering
    rng --> procedural
    snapshot --> sandbox
    tick --> physics
    tick --> ai
    procedural --> rendering
    pathfinding --> ai
    ai --> sandbox
    sandbox --> snake
    ai --> snake
    physics --> snake
```

The desired direction remains: snake proves pressure, generic packages move into `Libraries/AI`, `Libraries/Navigation`, `Libraries/Pathfinding`, `Libraries/Sandbox`, or other engine homes.

---

## 4. Cross-cutting foundations

### 4.1 Grid / topology contract 🟡→✅

`WorldObstacleGrid`, `gridNavEpoch`, edge stores, floor cells, `NavTopology`, `bakeNavTopology`, and worker SAB topology are the shared substrate. This replaces older nav context language.

- [x] Shared obstacle/topology epochs route grid edits to nav/perception/worker sync.
- [ ] ▶ Document the grid consumer contract: physics broadphase, nav topology, procedural stamps, perception, and render wall bakes.
- [ ] Dynamic kinetic-prop occupancy remains future work.

### 4.2 Seeded determinism 🟡

Per-system seeded RNG exists; one root seed that derives cavern, room graph, placement, and tuning streams does not.

- [ ] ▶ Unified root seed.
- [ ] Purge bare random generation in procedural paths.

### 4.3 Workers / SAB ✅

`SabSlotWorkerHost`, HPA worker, and flow worker are solid. Worker crash recovery is still shallow.

- [ ] Worker resilience for graph patch / worker errors.
- [ ] Reuse host shape for a second non-nav worker domain if needed.

### 4.4 Render caches ✅

Quantized sprite, baked sprite, affine texture, and offscreen caches are core infrastructure.

- [ ] ▶ Cache-pressure telemetry: hit/miss/eviction counts and scene unique key counts.

### 4.5 Persistence 🟡

Scene snapshots persist props, constraints, chains, room graph, factions, and visual overrides.

- [ ] ▶ Schema round-trip test for persisted fields.

### 4.6 Sim/render split 🟡

Physics/game hook boundary is peeled; render still reads live sim state without interpolation.

- [ ] Fixed-step accumulator + render interpolation investigation.

---

## 5. Spoke synopsis

### Physics

- [x] Rigid body core, SAT, sequential impulse, island sleep, distance constraints.
- [x] Warm-start/contact coherence stack is shipped.
- [x] Snake and sandbox chains exercise v1.
- [ ] Revolute/motor, CCD, breakable/mixed-shape chains only when gameplay demands them.

### Pathfinding

- [x] A*, HPA*, flow fields, SAB workers, incremental replan.
- [x] Runtime topology now lives in `Libraries/Navigation` (`NavRuntime`, `NavTopology`).
- [ ] ▶ Funnel/string-pull smoothing.
- [ ] Local separation / RVO-style crowd.

### Rendering

- [x] Four rendering pipelines: prop cache, grid stamp cache, wall atlas, overlays.
- [x] Radial pseudo-3D projection and bake/blit cache are mature.
- [ ] ▶ Projected shadows.
- [ ] Top-down / fixed isometric mode ladder.

### Procedural

- [x] CA caves, room-graph bake, corridor solver, locked-room and puzzle template bakes.
- [x] `Procedural/Mazes` adds maze/corridor/split helpers.
- [ ] ▶ Unified root seed.
- [ ] Room-graph generator v1.

### AI

- [x] Generic agent intent host.
- [x] Spatial memory, target memory, utility scoring, EQS option scoring.
- [x] Snake 4-mode forage FSM with effort-aware decisions and debug snapshots.
- [ ] ▶ Second non-snake consumer or behavior-tree skeleton.
- [ ] Faction hostility and broader targeting rules.

---

## 6. Library map

The detailed map lives in [library-audit.md](./library-audit.md). Condensed:

| Concern | Current homes |
|---|---|
| Physics | `Libraries/Motion`, `Libraries/Spatial/collision`, `Systems/World` |
| Pathfinding | `Libraries/Pathfinding`, `Libraries/Navigation`, `Libraries/Workers` |
| AI | `Libraries/AI/agentIntent`, `AI/brain`, `AI/memory`, `AI/utility`, `AI/eqs`, `Agent` |
| Rendering | `Libraries/Render`, `Canvas`, `WorldSurface`, `Spatial/iso`, `Render` |
| Procedural | `Libraries/CA`, `RoomGraph`, `Procedural/Mazes`, `Procedural/Motifs`, `Config/procedural` |
| Sandbox | `Libraries/Sandbox`, `SandboxEditor`, `Editor`, `UI`, `Pipeline` |
| Snake game | `Libraries/Game/snake`, `Config/games/snake.js`, snake-specific props |

---

## 7. Active tasks available to grab

### Highest strategic overlap

1. **Funnel / string-pull path smoothing** — pathfinding feel win, transfers to future navmesh, visibly improves snake chase/explore.
2. **Unified root seed** — procedural reproducibility, regression tests, future level generator.
3. **Second agent intent consumer** — proves `AI/agentIntent`, utility scoring, target memory, and EQS are not snake-only.
4. **Faction hostility** — turns persisted faction metadata into targeting behavior; bridge to squads/game theory.
5. **Render cache telemetry** — supports dense snake/sandbox scenes and sizes caches from evidence.

### By domain

| Domain | Grab-list |
|---|---|
| AI | second non-snake agent consumer; behavior-tree skeleton; faction hostility; target selection among multiple known entities; decision debug view |
| Pathfinding | path smoothing; local separation steering; worker resilience; single-cell belt edit nav resync |
| Procedural | unified root seed; seed golden tests; room-graph generator v1; Poisson/min-distance placement |
| Rendering | projected shadows; cache telemetry; projection/viewport tests; top-down 2D completion |
| Physics | revolute/motor joints, CCD, breakable links only after a gameplay feature needs them |
| Foundations | snapshot round-trip tests; grid/topology epoch contract doc; fixed-step accumulator investigation |

---

## 8. Limitations

- Maturity percentages are manual and approximate.
- This hub intentionally summarizes; spoke docs hold detail.
- The docs should be refreshed when a generic package lands from a snake proving-ground feature.

---

## 9. Spokes

[physics.md](./physics.md) · [pathfinding.md](./pathfinding.md) · [rendering.md](./rendering.md) · [procedural.md](./procedural.md) · [AI.md](./AI.md) · [library-audit.md](./library-audit.md)

*Last updated: roadmap/library-audit sync after generic AI intent, utility scoring, target memory, EQS explore, and effort-aware snake decisions.*
