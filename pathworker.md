# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** worker owns region graph build/patch (including portal hop abstract edges), nav topology derivation, and one-shot replan. Main still bakes hop CSR before nav pack and mirrors persist CSR for debug/replan assembly. Roughly **~90%** of the north star.

---

## North star

| | Main | Worker |
| --- | ---- | ------ |
| **Sim** | Write `obstacleGrid`, `edgeStore`, floors | — |
| **Nav** | Notify dirty bounds + epoch only | Derive walkability, regions, abstract CSR; patch in expanded hull |
| **Replan** | Request path (endpoints + epoch); apply waypoints; steer | Local vs HPA, abstract A*, stitch → cell path |
| **Debug** | Read-only mirror from worker SABs | Source of truth |

**One edit message:** sim was updated in this rect — reconcile nav. Not nav vocabulary (no “merge these regions” on the wire).

**Dirty bounds** = minimal AABB of the sim change. Worker expands hull (`damagePadding`, nav margin).

**Rules:** no dual graph authority; no in-memory migration shims (refresh resets); stale epoch → await worker, no silent main fallbacks; extend `Libraries/Pathfinding/` on the worker thread — no parallel graph implementations.

---

## Groundwork (done)

Spatial topology decoupling landed before the worker cutover:

- **PR1** — `portalSlotIndex`, `vertexPassability`, `syncGridTopologyCaches` spine; Spatial ⊥ Sandbox for grid nav.
- **PR2** — `boundaryNavHops.js` (Pathfinding) + `boundaryNavSync.js` (Sandbox policy); old `boundaryNavIndex` deleted.
- **PR3** — `gridCellTopology.js` (queries) + `World/wallGridBake.js` (3D bake); `wallGridCells.js` deleted.
- **Naming** — `gridCellTopology` exports match `NavGraph.js` glossary.

---

## Worker rewrite (done)

### Nav + replan SABs

- `HpaPathWorker` + `HpaWorkerEntry`: nav snapshot SABs (`blocked`, cardinal, vertex, hop CSR, octile), 512 replan slots, async `HpaPathSession`.
- One-shot `runReplan` on worker (temp connect → local or abstract A* → stitch); no per-candidate worker round-trips.
- `prepareHpaReplanPrep` on worker; main sends endpoints + `graphEpoch`, reads `replanMode` on `hpaDone`.
- Unified `replanHpaNavPath` for game + sandbox; sandbox keeps path across retarget (`markTargetChanged`).

### Region graph on worker

- Worker-only `buildRegionGraphFull` / `patchRegionGraph` / `rebuildDamagedRegionGraph`.
- Main path removed: no `HierarchicalNavigator` graph upload, no main `bakeAbstractGraphFlat` on replan.
- `NavigationService` serializes nav + graph sync on `_workerNavGraphSyncChain`.
- `sabCellToRegionIdx` on worker; Tile Lab HPA* Grid reads worker SAB via `getRegionGraphDebugView` (lazy bake on toggle).

### Tile Lab hygiene

- Engine loop owns canvas draw; sandbox `sync()` → panel only (`setUiSync`).
- Map overview repaints on edit / camera / layout — not every sim frame.

---

## Current architecture

```text
Edit / init on main:
  grid / edgeStore change
  → NavigationService.onObstaclesChanged(bounds)
      → syncGridTopologyCaches (main canStep cache only)
      → pack sim + hop CSR into worker SABs (patchNavTopology / full sync)
      → buildRegionGraphFull or patchRegionGraph (worker rebakes topology + wires hop region edges)

Replan:
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + mirrored graph meta (waypoints only)

Debug (Tile Lab): checkbox on → ensureLabPathDebugCache when epoch/topology stale.
```

**Still on main:** hop CSR bake (`bakeHopCsr` from `boundaryNavHops`); main `syncGridTopologyCaches` for `grid.canStep`; endpoint snap before `requestPath`; mirrored persist CSR for debug overlay and waypoint assembly.

**Separate copy:** flow field can read worker nav snapshot, but still maintains its own obstacle buffer path in some code paths — not fully deduped.

---

## Next PR

### PR3 — Regression harness + flow/nav dedup

Add automated repro cases called out in the plan but not started: rail-maze single-delete (path stable vs fresh load), cavern add/delete cycle (path matches cold rebuild), edit → replan without refresh, and epoch mismatch (stale replan discarded, no silent stale-graph path). Wire into whatever test runner the repo already uses for grid fixtures — goal is CI signal before further worker moves.

In the same pass, finish flow-field alignment with worker nav: flow BFS should read worker `sabBlocked` / nav snapshot only and drop the third standalone `sabObstacle` copy where it still exists. That closes the “one nav truth” loop left after PR1–PR2 and makes memory + invalidation behavior easier to reason about under load.

---

## Done (worker cutover PRs)

- **PR1** — Worker derives cardinal/vertex/octile from sim SABs; main packs raw grid/edge slices only.
- **PR2** — `wireNavHopRegionEdges` on worker after region patch/full build; removed main hop pair scan + second graph message.

---

## Later (not blocking)

- **Shared sim SAB** — optional zero-copy sim read on worker (raw grid/edge slices without main-side cache bake).
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
- **Mass path overlays** in Tile Lab (all active HPA movers, not selected prop only).
