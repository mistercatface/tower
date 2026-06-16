# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** region graph cutover **done**. Nav topology still baked on main and packed into worker SABs. Roughly **~70%** of the north star below.

---

## North star

| | Main | Worker |
| --- | ---- | ------ |
| **Sim** | Write `obstacleGrid`, `edgeStore`, floors | — |
| **Nav** | Notify dirty bounds + epoch only | Derive walkability, regions, abstract CSR; patch in expanded hull |
| **Replan** | Request path; apply waypoints; steer | Local vs HPA, abstract A*, stitch → cell path |
| **Debug** | Read-only mirror from worker SABs | Source of truth |

**One edit message:** sim was updated in this rect — reconcile nav. Not nav vocabulary (no “merge these regions” on the wire).

**Dirty bounds** = minimal AABB of the sim change. Worker expands hull (`damagePadding`, nav margin).

**Rules:** no dual graph authority; no in-memory migration shims (refresh resets); stale epoch → await worker, no silent main fallbacks; extend `Libraries/Pathfinding/` on the worker thread — no parallel graph implementations.

---

## Current architecture

Main sim is heap-owned. Worker holds two SAB domains: **nav snapshot** (blocked, octile, hops, passability slices) and **persist region CSR** (node col/row, edges, `cellToRegion`).

```text
Edit / init on main:
  grid / edgeStore change
  → syncGridTopologyCaches (vertexPassability, navCardinalOpen on main)
  → NavigationService.onObstaclesChanged(bounds)
      → pack nav slices into worker SABs (patchNavTopology / full sync)
      → buildRegionGraphFull or patchRegionGraph (worker thread)
      → optional connectRegionIdxPairs for boundary hops (main scans pairs, worker connects)

Replan:
  HpaPathSession.requestPath → worker slot (local A* or abstract + stitch)

Debug (Tile Lab): checkbox on → `ensureLabPathDebugCache` reads worker SAB mirror when `obstacleGeneration` / grid epoch changes; no eager bake on edit.
```

**Region graph:** `nodesMap` / hull repack live only on the worker (`HpaWorkerEntry` `regionGraphState`). Main mirrors CSR + `cellToRegion` from SABs for debug and replan prep — not a second authoritative graph.

**Still on main (intentional gap):** `syncGridTopologyCaches` before every nav sync; `prepareHpaReplanPrep` local-vs-HPA gate reads worker `cellToRegion`; `_collectHopRegionPairs` on main for portal/boundary reconnect.

**Separate copy:** flow field still uses its own `sabObstacle`, not worker nav blocked.

---

## Done (region graph cutover)

- Worker-only `buildRegionGraphFull` / `patchRegionGraph` (`hpaRegionGraph.js` shared with worker entry).
- Main path removed: no `HierarchicalNavigator`, no main `rebuildDamagedArea` / `syncAbstractGraph` / per-edit `packHpaGraphForWorker`.
- `NavigationService` serializes nav + graph sync on `_workerNavGraphSyncChain`.
- Debug overlay reads worker state, not main `nodesMap`.
- `sabCellToRegionIdx` on worker; main `getRegionGraphDebugView` / `getCellToRegionView`.
- Tile Lab startup: `initTileLabWorld` → `onObstaclesChanged` → `rebuildLabMapCaches` (no overview bake on mount).
- Removed dead main graph upload helpers (`packHpaGraphForWorker`, etc.); `MAX_HPA_GRAPH_NODES` lives in `HpaPathWorker.js`.

---

## Remaining work

### Nav derivation on worker

Stop requiring main `navCardinalOpen` / `vertexPassability` as the pack source for HPA. Worker should derive passability + octile in the expanded hull from sim (or a shared sim view), same modules, worker thread.

### Replan simplification

Move local-vs-HPA mode selection to the worker (`prepareHpaReplanPrep` today runs on main with mirrored `cellToRegion`). Main should pass endpoints + epoch; worker decides mode and plans.

### Boundary hops

Today main scans `forEachBoundaryHopCell` and posts pair list; worker connects. Target: worker discovers hop edges during hull patch without main posting pairs.

### Cleanup (low risk)

- ~~Delete unused `packHpaGraphForWorker`~~ — done; file removed.
- ~~Tile Lab init gate (`initTileLabWorld` → nav ready → map caches → layout)~~ — done.

### Regression tests (not started)

- Rail maze single-delete; cavern add/delete cycle — path matches fresh load.
- Edit → replan without refresh; epoch mismatch does not silently use stale graph.

---

## Later (not blocking)

- **Shared sim SAB** — optional zero-copy sim read on worker; sparse `edgeStore` can stay on main for editor.
- **Flow field** — read worker nav blocked (or shared blocked view); drop third `sabObstacle` copy.
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
