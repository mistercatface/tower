# Plans glossary — read this first

One place for naming traps and doc boundaries. Spoke docs link here instead of repeating the same warnings.

**Queue vs encyclopedia:** active work lives in [NOW.md](./NOW.md). Domain depth lives in spoke docs. Time journal lives in [todo.md](./todo.md).

**Domain docs (new):** [games/snake.md](./games/snake.md) · [foundations/grid-contract.md](./foundations/grid-contract.md) · [sandbox-editor.md](./sandbox-editor.md) · [foundations/architecture-health.md](./foundations/architecture-health.md)

---

## Three different “procedural”

| When you say…           | Meaning                                                             | Code / doc                                                                               |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Procedural textures** | Perlin/Voronoi _visual_ motifs on floors/walls                      | `Libraries/Procedural/Motifs`, `Fields`, `Noise` · [rendering.md](./rendering.md) Tier 8 |
| **World-gen pipeline**  | Seed → carve → room graph → bake → corridors → stamps               | `Libraries/CA`, `RoomGraph`, corridor bake · [procedural.md](./procedural.md)            |
| **Layout algorithms**   | Specific generators: R-DFS, voxel CA, belt post-process, split maps | `Libraries/Procedural/Mazes` · [Mazes.md](./Mazes.md)                                    |

**Rule:** Don’t say “procedural” alone. Say **textures**, **pipeline**, or **layout algorithm**.

---

## World-gen doc map

| Layer       | Question it answers                   | Doc                                       |
| ----------- | ------------------------------------- | ----------------------------------------- |
| Pipeline    | How does intent become grid geometry? | [procedural.md](./procedural.md)          |
| Algorithms  | Which CS generator (DFS, CA, BSP, …)? | [Mazes.md](./Mazes.md)                    |
| Routing     | How are corridors/path baked?         | [pathfinding.md](./pathfinding.md) Tier 9 |
| Drawing     | How does geometry look on screen?     | [rendering.md](./rendering.md) Tiers 6, 8 |
| Solvability | Is a puzzle fair / hard?              | [AI.md](./AI.md) (analysis, not stamping) |

**Resolution vs authorship:** the pipeline is strong at **resolution** (bake authored/seeded input into real geometry). **Authorship** (layout from one root seed) is the headline gap — see procedural Tier 11.

---

## Voxel fill vs rail walls

Two wall roles on the same cell-edge graph. Pick **one primary representation per chunk**.

|                      | **Voxel fill**              | **Rail walls**                                      |
| -------------------- | --------------------------- | --------------------------------------------------- |
| **Blocks via**       | Filled `grid[]` cells       | `railWall` on shared edges                          |
| **Typical output**   | CA caves, solid mass        | Spanning tree → thin corridor rails                 |
| **Stamp API**        | `stampStaticWalls(cells)`   | `setBoundary(… railWall …)` / `stampRailWallsBatch` |
| **Shipped examples** | `generateLabCaverns` (V-CA) | `railMazeDfs.js` (R-DFS)                            |

Full checklist and algorithm IDs (V-CA, R-DFS, G-corridor, …) → [Mazes.md](./Mazes.md).

---

## Code & API naming traps

| You see…                                         | It actually is…                                               | Do not confuse with…                              |
| ------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------- |
| `Libraries/Procedural/Motifs`, `Fields`, `Noise` | Surface texture synthesis                                     | Geometry in `CA`, `RoomGraph`, `Procedural/Mazes` |
| `Libraries/Procedural/Mazes`                     | Layout/geometry helpers (rails, belts, split layouts)         | Texture motifs under `Procedural/Motifs`          |
| `Spatial/iso/IsometricProjection.js`             | Camera-relative radial elevation                              | True fixed isometric mode (future rendering)      |
| `prop.strategy`                                  | Prop capability config (physics, render, sandbox)             | AI strategy / GOAP (not implemented)              |
| `target` in `snakeFood` or ground nav            | Movement target / food prop                                   | AI strategic objective                            |
| `Libraries/FSM/transition.js`                    | Prop lifecycle transition helper                              | Agent intent FSM → `AI/agentIntent/`              |
| `Libraries/AI/brain`                             | Spatial cell memory + nav step penalty producer               | Target memory → `AI/memory/targetMemory.js`       |
| `navStepPenalty.js` (×2)                         | Brain builds penalties; Pathfinding consumes in A\*           | Same implementation twice                         |
| `Libraries/Navigation`                           | Runtime nav wiring, perception, steering, topology sync       | Search algorithms → `Libraries/Pathfinding`       |
| `Libraries/Motion`                               | Integration, constraints, solver, wall resolution             | Collision → `Spatial/collision`                   |
| `Libraries/WorldSurface`                         | Chunk floor/wall texture-atlas baking                         | Per-prop texturing → `Render/SurfaceTexturing`    |
| `Libraries/Sandbox`                              | Engine sandbox systems (nav behaviors, snapshots, map-gen UI) | Snake game rules → `Libraries/Game/snake`         |
| `agentProfile`                                   | Species-level capability configurations                       | Instances of `AgentInstance` or `agentIdentity`   |
| `DynamicSpeciesMap`                              | On-demand dynamic species lookup                              | Hardcoded species references                      |
| `gunBulletSystem` / `rangedCombat`               | Projectile/shooting FSM and collision routines                | Core rigid body physics steps                     |
| `customSystems`                                  | Custom ticker loop hooks runner (e.g., bullet ticks)          | Main game simulation loop (`setupSnakeGame`)      |

Code map detail → [library-audit.md](./library-audit.md).

---

## Maturity percentages in ROADMAP

Dashboard **~NN%** values are **manual snapshots**, not computed. Ground truth for shipped work: tier checkboxes in spoke docs. Update percentages only when doing a deliberate dashboard pass — or ignore them and use [NOW.md](./NOW.md) + spoke tiers instead.
