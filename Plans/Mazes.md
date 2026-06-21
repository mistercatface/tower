# Mazes & spatial layout — research tree

Progress tracker and **computer-science index** for maze generation: spanning trees, cycle injection, space partitioning, agent carving, constraint propagation, and grammar-based layout. Percentages are **honest engineering readiness** (shipped, verified, wired to gameplay).

**Legend:** ✅ shipped · 🟡 partial · ⬜ not started · 🔗 owned by another doc · 🔜 planned

**Related docs (overlap OK for now — consolidate later):**

- 🔗 [`procedural.md`](procedural.md) — end-to-end procgen pipeline, room graph model, corridor **solver bridge**, bake-to-geometry, world scale
- 🔗 [`pathfinding.md`](pathfinding.md) — corridor A\*, HPA, `canStep` / boundary graph
- 🔗 [`rendering.md`](rendering.md) — wall atlas (voxel fill) vs edge-rail draw (boundary graph)

---

## The confusion: voxel fill vs rail walls (read this first)

Two different **geometry roles** on the same four-way **cell-edge graph**. Mixing the names is why rails “look like shit” when treated as chunky voxels.

|                       | **Voxel maze**                                                 | **Rail-wall maze**                                                                              |
| --------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **What blocks**       | Filled `grid[]` cells (solid mass)                             | `railWall` entries on **shared edges** between walkable cells                                   |
| **Walkable space**    | Empty cells (`grid[] === 0`)                                   | Same — floor cells stay empty; walls are _boundaries_                                           |
| **Typical CS output** | CA-smoothed rock field, noise threshold, or carved cell bitmap | Perfect/imperfect maze on dual graph: **spanning tree + optional cycle injection** → edge rails |
| **Visual**            | Iso building mass / cave blob                                  | Thin corridor **rails** (editor corridor look)                                                  |
| **Stamp API**         | `stampStaticWalls(cells)`                                      | `setBoundary(… railWall …)` / `stampRailWallsBatch`                                             |
| **LOS / nav**         | `grid.isBlocked` + `boundaryBlocksStepFrom`                    | Same boundary pipeline — rails must use edge graph, not fake voxels                             |

**Rule:** Pick one primary wall representation per chunk. Connecting chunks = open strips + shared walkable cells, not “voxel wall where a rail should be.”

---

## Generator checklist — by geometry type

Use this as the narrow vocabulary going forward. `[x]` = in repo and used · `[~]` = partial / misnamed / fallback · `[ ]` = not built.

### A — Voxel-fill mazes (cell occupancy)

| ID            | CS technique                                            | Status | Where / notes                                                        |
| ------------- | ------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| **V-CA**      | Cellular automata (Moore, majority rule) on random fill | ✅     | `cellularAutomata.js` → `generateLabCaverns` — organic caves         |
| **V-CA-rail** | CA on **edge grid** (horizontal + vertical edge arrays) | 🟡     | `generateLabRailCaverns` — rail CA; snake fallback only, often muddy |
| **V-noise**   | Perlin / threshold / worm                               | ⬜     | —                                                                    |
| **V-carve**   | Drunkard’s walk / recursive backtracker on **cells**    | ⬜     | —                                                                    |

### B — Rail-edge mazes (boundary graph)

| ID                              | CS technique                                                                       | Status | Where / notes                                           |
| ------------------------------- | ---------------------------------------------------------------------------------- | ------ | ------------------------------------------------------- |
| **R-DFS**                       | Randomized DFS spanning tree on logical cell graph → open walls → `railWall` stamp | ✅     | `Libraries/Procedural/Mazes/railMazeDfs.js`             |
| **R-loop**                      | Cycle injection (`extraLinkRatio` wall clearance)                                  | ✅     | Same file                                               |
| **R-chamber**                   | Local wall removal / 2×2 merges (open pockets)                                     | ✅     | Same file                                               |
| **R-mask**                      | Binary **floor mask** → outline walkable → `railWallsFromFloorMask`                | ✅     | `roomGraphCorridorRails.js` — shared with corridor bake |
| **R-BSP**                       | BSP room leaves + MST inter-room links → floor mask → rails                        | ⬜     | Planned; do **not** confuse with shipped R-DFS          |
| **R-Prim / R-Kruskal / Wilson** | Other spanning-tree samplers on dual graph                                         | ⬜     | Same stamp path as R-DFS                                |

### C — Room-graph + corridor solver (separate track — do not forget)

| ID             | Technique                                                   | Status | Where / notes                                                       |
| -------------- | ----------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| **G-room**     | Authored / manual rect nodes + links                        | ✅     | `RoomGraph/` — editor-first                                         |
| **G-bake**     | Closed rooms + gap keys → perimeter rails                   | ✅     | `roomGraphBake`, `roomGraphClosedRooms`                             |
| **G-corridor** | A\* corridor bundle between room rects → floor mask → rails | ✅     | `corridorBundle.js`, `roomGraphCorridorApply` — 🔗 `pathfinding.md` |
| **G-auto**     | Seed → auto room graph (BSP / packing / MST)                | ⬜     | 🔗 `procedural.md` Tier 11                                          |

This pipeline is **not** the snake autosim default. It is the right tool for **structured dungeon chunks** and editor room links.

### D — Directed / one-way mazes (future)

| ID            | Technique                                                | Status | Notes                                                  |
| ------------- | -------------------------------------------------------- | ------ | ------------------------------------------------------ |
| **D-belt**    | Perfect maze + **one-way floor belts** on corridor cells | 🔜     | **Safe directed-belt post-process** — see below        |
| **D-passage** | One-way **forcefield** edges instead of belts            | ⬜     | `PASSAGE_MODE.OneWay` on boundary graph                |
| **D-graph**   | Strongly connected components / Eulerian trail puzzles   | ⬜     | Gameplay validation 🔗 `AI.md`                         |

Belts and one-way passages belong in this doc as **maze semantics**, not just floor props.

#### D-belt-safe post-process (planned PR)

**Problem:** R-DFS rail mazes are undirected walkable graphs. One-way floor belts (`floorStore` + belt facing + entry/exit sides) turn corridor cells into **directed edges**. A naive stamp can **strand** regions — unlike room-graph corridor belts, which are authored on known A\* paths between rects.

**CS core:** Build the **nav walkable graph** on stamped geometry (`collectNavWalkableCells` / `canStep` + `NavTopology`). Classify cells (dead-end / corridor / junction). Propose belt candidates on **straight corridor runs** (degree-2 chains). For each `(cell, facing)`, **simulate** belt entry rules (`beltBlocksEntryFrom`), then verify the directed graph stays **strongly connected** (Tarjan/Kosaraju SCC — one component covering the playable flood) or at minimum preserves reachability from the chunk seam seed. Only **safe** candidates get stamped (`floorStore` + optional `BeltRails` lateral edges).

**Snake hook:** run after `generateLabRailDfsMaze` in `generateSnakeSplitMap` (lower band only); density/seed from `mapSeed` sub-stream.

**Extensibility:** First **layout post-process** in `Libraries/Procedural/Mazes/postProcess/` — input = `{ grid, bounds, navTopology }`, output = floor stamps + `damageBounds`. Future ops same machine: dead-end trim, loop injection, belt-safe pass. Not a texture motif stack — operates on **geometry + nav graph**, validates before mutating. Fits chunk composer recipe: `R-DFS` → `D-belt-safe` → nav runtime obstacle commit.

🔗 [`ROADMAP.md`](ROADMAP.md) cross-cutting grid · [`procedural.md`](procedural.md) bake pipeline · [`pathfinding.md`](pathfinding.md) belt nav rules

---

## CS algorithm index (textbook names)

| Paradigm           | Primary CS technique                                     | Shipped here?                                               |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------- |
| Perfect grid maze  | Randomized DFS / Prim / Kruskal / Wilson on dual graph   | R-DFS only                                                  |
| Imperfect maze     | Uniform edge removal / extra openings (`extraLinkRatio`) | ✅                                                          |
| Space partitioning | BSP, quadtrees → room rects                              | ⬜ (G-auto)                                                 |
| Room connectivity  | MST on room centroids                                    | ⬜ (corridor solver does pairwise A\*, not full layout MST) |
| Agent carving      | Drunkard’s walk, self-avoiding walk                      | ⬜                                                          |
| Constraint layout  | WFC, AC-3                                                | ⬜                                                          |
| Grammar layout     | Mission graph + spatial embedding                        | ⬜                                                          |
| Organic mass       | CA majority rule                                         | V-CA ✅                                                     |

---

## Snake today (reference implementation — not the library home)

Current split map (`snakeScene.generateSnakeSplitMap`):

1. **Upper chunk:** V-CA cavern (`generateLabCaverns`)
2. **Padding strip:** cleared walkable (`clearSnakeRegionPaddingStrip`)
3. **Lower chunk:** R-DFS rail maze (`generateLabRailDfsMaze` + `stampGlobalRailWalls`)

Food/spawn pool: `collectSnakePlayableOpenCells` (full inner play bounds — cavern + pad + rail).

**Honest debt:** maze **math** lives in `Libraries/Procedural/Mazes/`; snake only chooses chunk recipes via `snakeScene`.

---

## 🔜 Maze garden — 1024×1024 autosnake endgame

Target: one large world (`playAreaCols/Rows` → 1024), **not** one monolithic generator. A **chunk composer** places fixed-size regions (e.g. 64×64 or 128×128), each with a `(geometry, algorithm)` recipe from the checklist above, stitched with deterministic **interface strips** (open rows/cols, matching padding rules).

```text
world seed
  → chunk grid (cx, cy)
  → per chunk: pick recipe from table (seed + biome + distance)
  → stamp into expanded obstacleGrid
  → seam pass: ensure cross-chunk walkability (vent carving / boundary clear)
  → nav epoch bump per dirty chunk
```

**Recipe table (initial):**

| Chunk tag        | Geometry | Algorithm                          | When to use                                |
| ---------------- | -------- | ---------------------------------- | ------------------------------------------ |
| `cavern-dense`   | Voxel    | V-CA (high fill)                   | Claustrophobic tops, loot density          |
| `cavern-vent`    | Voxel    | V-CA + south/north open strip      | Vertical connectors between bands          |
| `rail-dfs-tight` | Rail     | R-DFS, low extraLinkRatio          | Classic maze corridors                     |
| `rail-dfs-loopy` | Rail     | R-DFS + high extraLinkRatio        | Combat / chase loops                       |
| `rail-dfs-belts` | Rail     | R-DFS + **D-belt-safe** post-pass  | Directed corridors without stranded regions |
| `rail-rooms`     | Rail     | G-corridor bake on mini room graph | Structured pocket (editor-quality)         |
| `pad`            | —        | cleared strip                      | Mandatory seam between incompatible chunks |

Snake-specific: player bias to lower bands early; endgame fills more of the 1024²; HPA already supports expandable grid — chunk composer must **expandToCoverAabb** incrementally.

---

## Recommended next engineering (layout primitives)

1. ~~**Rename & relocate:** `snakeRailBspMaze` → `railMazeDfs.js`~~ ✅
2. **R-BSP chunk:** BSP leaves → floor mask → `railWallsFromFloorMask` (reuse room-graph rail outline).
3. **Chunk composer module:** seeded `(cx,cy) → recipe → stampBounds` — no snake imports in generator core.
4. **Dead-end trim utility** on logical maze before rail stamp (Tier-1 cleanup).
5. **D-belt-safe post-process** — SCC-validated one-way belts on R-DFS corridors (lower snake band); first layout post-process op.

---

## Key file references

```text
Plans/Mazes.md                          — this doc
Plans/procedural.md                     — room graph, corridor solver, world scale
Libraries/Procedural/Mazes/
  railMazeDfs.js                        — R-DFS bake
  postProcess/                          — 🔜 layout post-ops (D-belt-safe, …)
  walkableCells.js                      — collectWalkableCells / pickWalkableCell
  stampRailWalls.js                     — stampGlobalRailWalls
Libraries/RoomGraph/roomGraphCorridorRails.js — R-mask / rail outline from floor
Libraries/Pathfinding/Corridor/         — G-corridor solver
Apps/Editor/world/mapWorld.js           — generateLabCaverns, generateLabRailDfsMaze
Libraries/Game/snake/snakeScene.js      — split-map orchestration (→ chunk composer)
Libraries/Navigation/perception/gridCellVision.js — LOS on boundary graph
tests/railMazeDfs.test.js
tests/walkableCells.test.js
tests/snakeMapGen.test.js
```

---

## Cleanup / redundant (post-snake maze pass)

| Item                                                 | Verdict                                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| ~~`rail.generator: "bspMaze"` + `snakeRailBspMaze`~~ | ✅ Renamed `railDfs` / `railMazeDfs.js`                            |
| ~~`roomSizeMin/Max/Margin` in snake rail config~~    | ✅ Removed                                                         |
| ~~`generateLabRailCaverns` snake fallback~~          | ✅ Removed from snake; lab editor keeps it                         |
| ~~`corridorBundle` `searchBounds` param~~            | ✅ Removed                                                         |
| ~~`collectOpenCavernCells` / `cavernFloorCells.js`~~ | ✅ → `walkableCells.js`                                            |
| Corridor-maze / `snakeRailCorridorMaze`              | **Deleted** — do not resurrect without floor-mask + grid stamp fix |
| ~~`visionCone.stroke`~~                              | ✅ Removed — fill-only overlays                                    |
