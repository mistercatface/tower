Where we are: Sim boundary peel is **done** — tick/world/hooks, `worldProps`, **GridNavContext** (`NavigationService` + unified `boundaryBlocksStepFrom` + worker SAB pre-bake). Vision and walkable-cell queries no longer lazily rebuild nav caches per ray. Physics v1 is maintenance-ready; headline gaps remain Trilogy C (manifolds, revolute/motor joints, breakable links) and chain-vs-wall sweep. Snake runs multi-head combat, flee-from-threat, striker splits, and a 30-agent perf gate on the peeled stack. Upper band = V-CA; lower band = R-DFS rail maze (`generateSnakeSplitMap`).

Where to go next: **Mazes library foundation + D-belt-safe post-process** — four PRs that nail early architecture, dedupe helpers, and end with one-way belts in the snake rail cavern band. Detail lives in [Mazes.md](./Mazes.md); this doc is the ship sequence.

---

## Endgame

Snake lower band recipe: `R-DFS` → sync nav → **D-belt-safe** → `onObstaclesChanged`. Belts only on straight corridor runs; every stamp validated so the directed nav graph stays **strongly connected** (no stranded regions).

**Not the same problem as** `roomGraphCorridorBelts.js` — those are authored A\* paths between known room rects. Mazes post-process runs on **stamped geometry + nav graph** after procedural layout.

---

## Architecture target

```text
R-DFS stamp (geometry)
  → sync GridNavContext
  → buildMazeNavGraph (pure — no sandbox cache)
  → classify topology (dead-end / corridor / junction)
  → collect corridor runs (degree-2 chains)
  → plan directed belts (simulate + SCC gate)
  → stamp floorStore + damageBounds
  → onObstaclesChanged
```

**Library home:** `Libraries/Procedural/Mazes/`  
**Post-process ops:** `Libraries/Procedural/Mazes/postProcess/`

### Shared contract (every op)

Input context — grid-bound, **no snake imports** in Mazes core:

```javascript
{
  grid,
  gridNavContext,
  boundsConfig,   // mapGen rect for this chunk
  rng,            // seeded sub-stream
  seedSlice,
}
```

Op output:

```javascript
{
  floorBelts: [{ col, row, kind, facingIndex }],
  damageBounds,  // nav epoch bump
}
```

Runner: `runMazePostProcess(ctx, ops[])` merges belts + unions `damageBounds`.

---

## Four-part PR stack

### PR 1 — Nav graph + post-process shell

**Goal:** Pure maze analysis on `grid + GridNavContext`; establish library boundary before belt logic.

| Add | Role |
|-----|------|
| `Mazes/mazeNavGraph.js` | Undirected adjacency from nav-walkable cells via `canStep` |
| `Mazes/collectMazeNavWalkableCells.js` | Bounds-scoped nav walkable list without `state.sandbox` cache (tests + post-process) |
| `Mazes/postProcess/postProcessContext.js` | Context factory |
| `Mazes/postProcess/runMazePostProcess.js` | Sequential op runner |

**Dedupe:** single `walkableCellKey` export (`walkableCells.js`); `navWalkableCell.js` imports it. One cardinal-neighbor helper using `CARDINAL_OFFSETS` from `GridUtils.js`.

**Tests:** `tests/mazeNavGraph.test.js` — hand fixture degrees; rail DFS fixture connected + in bounds; fixed-seed determinism.

**Out of scope:** belts, SCC, stamping, snake.

---

### PR 2 — Topology: classify cells + corridor runs

**Goal:** CS layer reusable for dead-end trim, loop injection, D-passage later.

| Add | Role |
|-----|------|
| `Mazes/mazeTopology.js` | Degree; classify `DeadEnd` / `Corridor` / `Junction` |
| `Mazes/collectCorridorRuns.js` | Maximal degree-2 chains → ordered cells + axis + facing hints |

Runs stop at junctions/dead-ends. Length-1 dead-end arms excluded from belt candidacy here.

**Dedupe:** adjacency only from `mazeNavGraph.js`; bounds filter via `filterWalkableCellsInBounds`.

**Tests:** `tests/mazeTopology.test.js` — T-junction, straight hall, rail maze run counts.

**Out of scope:** directed edges, SCC, floor mutation.

---

### PR 3 — Directed nav validation + belt plan (no stamp)

**Goal:** CS core — safe belt proposals without touching the world.

| Add | Role |
|-----|------|
| `Mazes/directedNavGraph.js` | Belt facings overlay → directed adjacency |
| `Mazes/stronglyConnected.js` | Tarjan SCC |
| `Mazes/postProcess/planDirectedBelts.js` | Pick runs → propose `(cell, facing)` → simulate → SCC → return plan |

**Belt semantics — extend, don't fork:**

- Facing math: `floorBeltEntryExitSides` / `FloorCell.js`
- Step blocking: export **`beltBlocksNavStep(grid, belts, from, to)`** (or equivalent) in `boundaryOccupancy.js` for hypothetical belt maps; base topology still `boundaryBlocksStepFrom`
- SCC rule: one component covering the playable flood (document + test the exact rule)

Plan config surface: `density`, `minRunLength`, `kind` (Belt / BeltRails later).

**Tests:** `tests/planDirectedBelts.test.js` — 4-cell line wrong-way fails SCC; consistent facing passes; rail fixture never proposes on junctions.

**Out of scope:** `floorStore` writes, snake.

---

### PR 4 — Stamp, snake hook, end-to-end

**Goal:** Product — lower rail band gets belts; recipe `rail-dfs-belts` is real.

| Wire | Where |
|------|-------|
| `applyDirectedBeltPlan` | Write `floorStore` + optional BeltRails |
| `postProcess/directedBeltsSafe.js` | Full op: plan → stamp → `damageBounds` |
| Snake hook | `generateSnakeSplitMap` after `generateLabRailDfsMaze` |
| Config | `snakeGameConfig.rail.directedBeltDensity`, `directedBeltMinRunLength`, seed sub-stream from `mapSeed` |

**Hook order:**

```text
generateLabRailDfsMaze
  → onObstaclesChanged (rail bounds)
  → runMazePostProcess (rail bounds only)
  → onObstaclesChanged (belt damageBounds)
clearSnakeRegionPaddingStrip   // unchanged
```

**Tests:** `tests/mazeDirectedBeltsSafe.test.js` full pipeline; extend `snakeMapGen.test.js` — belts in lower band only when density > 0.

**Docs:** [Mazes.md](./Mazes.md) D-belt ✅; [ROADMAP.md](./ROADMAP.md) procedural nudge.

**Follow-ups (not this stack):** chunk composer, D-passage forcefields, dead-end trim op.

---

## Ownership / dedupe (after stack)

| Concern | Owner |
|---------|--------|
| Cell keys `"col,row"` | `walkableCells.walkableCellKey` |
| Nav-walkable flood (pure) | `collectMazeNavWalkableCells` |
| Nav-walkable flood (gameplay cache) | `walkableCells.js` state wrappers |
| Undirected adjacency | `mazeNavGraph.js` |
| Topology / runs | `mazeTopology.js`, `collectCorridorRuns.js` |
| Belt entry blocking (sim) | `boundaryOccupancy.js` |
| Belt facing math | `FloorCell.js` |
| Directed reachability | `stronglyConnected.js` |
| Room A\* corridor belts | `roomGraphCorridorBelts.js` — unchanged |

---

## PR titles (suggested)

1. `mazes: nav graph + post-process shell`
2. `mazes: topology classification and corridor runs`
3. `mazes: SCC-safe directed belt planning`
4. `snake: D-belt-safe post-pass on rail cavern band`

Each PR merges green on its own tests. PR 4 is the only snake touch; `directedBeltDensity: 0` preserves today’s behavior if needed.

---

## Other next wins (after Mazes stack)

- Reusable agent FSM (seek / explore / flee / pursue on brain + `GridNavContext` vision)
- Path funnel / string-pull smoothing for chase/retreat
- Predator–prey pursue (complement to shipped flee)
- Physics v2 only when gameplay demands it (breakable links, corridor wedge)
