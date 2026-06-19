# Maze & level layout generators — research tree

Progress tracker and CS index for maze generation algorithms and spatial layout generators: spanning trees, loop-injection (imperfect mazes), space partitioning (BSP), agent-carving (drunkard's walk), constraint satisfaction (WFC), and grammar-based layout. Percentages represent **honest engineering readiness** (shipped, verified, and wired to gameplay).

**Legend:** ✅ shipped · 🟡 partial · ⬜ not started · 🔗 owned by another doc (referenced here) · 🔜 planned

---

## Scope & ownership

This document serves as the master catalog and technical roadmap for **maze-building and spatial layout algorithms**.

| Paradigm | Primary CS Technique | Visual/Gameplay Characteristic |
|---|---|---|
| **Perfect Grid Mazes** | Spanning Tree Algorithms (DFS, Kruskal's, Prim's) | Tight, winding, single-path corridors; no loops or open chambers. |
| **Imperfect & Loopy Mazes** | Graph Cycle Injection, Spanning Forests | Winding corridors with loops, shortcuts, and dead-end removals. |
| **Space Partitioning** | Binary Space Partitioning (BSP), Quadtrees | Structured room-and-corridor layouts; rectangular subdivisions. |
| **Agent-Based Carving** | Drunkard's Walk, Self-Avoiding Agents | Organic, cavernous, or messy winding paths. |
| **Constraint-Based Layout** | Wave Function Collapse (WFC), SAT Solvers | Tile-based local-pattern matching; highly structured constraints. |
| **Grammar-Based Layout** | Graph Grammars, L-Systems | Mission-to-space mapping; topological keys, locks, and progression. |

---

## Where this sits vs standard level generators

This comparison maps maze and level generation paradigms against classic game implementations.

| Paradigm | This engine | Classic Game Examples | CS Core |
|---|---|---|---|
| **Grid-Rail DFS Maze** | ✅ Shipped | Pac-Man, Snake, classic pencil-and-paper mazes | Randomized Depth-First Search over a cell-edge boundary grid |
| **Hollow-Room BSP** | 🟡 Replaced | Rogue, NetHack, Diablo I | Hierarchical division of space using BSP trees + corridor connectors |
| **Organic Caves** | ✅ Shipped | Spelunky, Terraria, Minecraft | Cellular Automata majority-rule smoothing on randomly filled grids |
| **Topological Progression** | ⬜ Not started | Zelda dungeons, Metroidvania maps | Graph Grammars separating "Mission (key/lock keys)" from "Space" |
| **Micro-Structure Detail** | ⬜ Not started | Townscaper, Bad North | Wave Function Collapse (WFC) propagating local adjacency rules |

---

## Fundamentals checklist — textbook maze & layout coverage

Which **CS maze and level layout building blocks** exist in the codebase? `[x]` = implemented and used · `[~]` = present as a narrow/special case · `[ ]` = absent.

### Spanning Trees (Perfect Mazes)
- [x] **Randomized DFS (Backtracking)** — implemented in `snakeRailBspMaze.js` to build tight winding corridors.
- [ ] **Kruskal's Algorithm** — absent; randomized minimum spanning tree algorithm.
- [ ] **Prim's Algorithm** — absent; randomized vertex-addition algorithm.
- [ ] **Wilson's Algorithm** — absent; generates unbiased uniform spanning trees via loop-erased random walks.

### Cycle Injection (Loopy Mazes)
- [x] **Dead-End Wall Removal** — implemented via `extraLinkRatio` which randomly clears remaining closed boundaries to create cycles/loops.
- [x] **Room Chamber Merging** — implemented by merging 2x2 logical cell blocks to create larger open chambers in the maze.

### Space Partitioning (Subdivisions)
- [ ] **Binary Space Partitioning (BSP)** — absent; previously attempted room splits without boundary edges, currently not represented.
- [ ] **Voronoi / Delaunay Layouts** — absent for layout synthesis (exists in nav regions and shaders).

### Agent Carving
- [ ] **Drunkard's Walk** — absent; random-walk carving.
- [ ] **Mining Agents** — absent; directional agents that respect grid layouts.

---

## Tiers of Maze & Level Generators

### Tier 0 — Perfect Grid Mazes (Spanning Trees)
Perfect mazes have exactly one path between any two cells, resulting in a tree structure.

| Item | Status | % | Notes |
|------|--------|---|-------|
| Randomized DFS | ✅ | 100 | Winding, nested corridors. Shipped in [snakeRailBspMaze.js](file:///c:/Users/mrjbl/Desktop/tower/Libraries/Game/snake/snakeRailBspMaze.js) |
| Randomized Kruskal's | ⬜ | 0 | Generates shorter, more fragmented corridors (forest merge) |
| Randomized Prim's | ⬜ | 0 | Generates high branch-factor mazes (radial growth) |
| Wilson's Algorithm | ⬜ | 0 | Perfect uniform distribution, unbiased corridors |

**Branch progress: 25%**

---

### Tier 1 — Imperfect & Loopy Mazes
Essential for active gameplay like snake or combat, as perfect tree-structure mazes create trap-prone dead ends.

| Item | Status | % | Notes |
|------|--------|---|-------|
| Randomized Wall Clearance | ✅ | 100 | Uses `extraLinkRatio` to inject loops |
| 2x2 Chamber Merges | ✅ | 100 | Merges adjacent cells to create open room pockets |
| Dead-End Trimming | ⬜ | 0 | Recursively prunes nodes with degree 1 |
| Spanning Forest Generation | ⬜ | 0 | Generates multiple disjoint trees, then links them selectively |

**Branch progress: 50%**

---

### Tier 2 — Space Partitioning (BSP & Subdivisions)
Structured layouts where space is recursively split and rooms are carved inside the leaves.

| Item | Status | % | Notes |
|------|--------|---|-------|
| BSP Room Divison | ⬜ | 0 | Split horizontal/vertical planes to generate room blocks |
| Quadtree Partitioning | ⬜ | 0 | Recursive 4-way splitting for multi-scale room layouts |
| Corridor Graph Connectors | ⬜ | 0 | Minimum Spanning Tree (MST) on leaf centers to connect rooms |

**Branch progress: 0%**

---

### Tier 3 — Agent-Based Carving
Generates organic, winding tunnels and cave corridors through step-by-step mining.

| Item | Status | % | Notes |
|------|--------|---|-------|
| Drunkard's Walk | ⬜ | 0 | Carves grid cells using a biased random walk |
| Corridors with Inertia | ⬜ | 0 | Agent maintains direction for N steps, generating straight hallways |
| Self-Avoiding Walks | ⬜ | 0 | Carver avoids wrapping back onto their own paths |

**Branch progress: 0%**

---

### Tier 4 — Constraint-Based Layouts (WFC & SAT)
Arranges tiles or rooms according to strict adjacency rules, propagating constraints to avoid invalid configurations.

| Item | Status | % | Notes |
|------|--------|---|-------|
| Wave Function Collapse (WFC) | ⬜ | 0 | Synthesizes local tile grids based on input samples |
| Arc Consistency (AC-3) | ⬜ | 0 | Constraint propagation during cell placement |
| Backtracking Solver | ⬜ | 0 | Backtracks when WFC reaches a contradiction state |

**Branch progress: 0%**

---

### Tier 5 — Grammar-Based Dungeons (Zelda-style)
Layouts generated top-down, separating the mission (the logical flow of keys, locks, and bosses) from the physical space.

| Item | Status | % | Notes |
|------|--------|---|-------|
| Mission Graph Synthesis | ⬜ | 0 | Node graph representing keys, locks, and goals |
| Graph Rewriting Rules | ⬜ | 0 | Graph grammar replacement to increase dungeon depth |
| Spatial Layout Mapping | ⬜ | 0 | Maps the abstract mission nodes to grid coordinates |

**Branch progress: 0%**

---

## What's Shipped vs What's Recommended Next

### Shipped Primitives
1. **Randomized DFS Grid-Rail Carver**: Built directly on the cell-edge boundary graph, producing high-quality winding corridors.
2. **Loopy-Passage Clearance & Chambers**: Overcomes perfect-maze bottlenecks, creating playable arenas for AI and players.

### Recommended Next Layout Primitives
1. **Dungeon BSP Generator (Tier 2)**: Write a generator that creates hierarchical room divisions and connects them via a Minimum Spanning Tree (MST). This is the key tool for traditional room-and-corridor layouts.
2. **Drunkard's Walk Tunnel Carver (Tier 3)**: An organic tunnel generator that offers a visual contrast to cellular-automata caves.
3. **Dead-End Pruning (Tier 1)**: A utility to clean up small 1-cell dead ends from loopy mazes, leaving only circular pathways.

---

## Key File References

```
Plans/Mazes.md                     — This document
Libraries/Game/snake/
  snakeRailBspMaze.js               — Seeded DFS grid-rail generator
tests/
  snakeRailBspMaze.test.js          — Unit tests validating DFS and determinism
```
