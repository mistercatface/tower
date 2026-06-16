# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** region graph + replan mode selection on worker. Nav topology still baked on main and packed into worker SABs. Roughly **~80%** of the north star.

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
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep (local vs HPA) → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + mirrored graph meta (waypoints only)

Debug (Tile Lab): checkbox on → ensureLabPathDebugCache reads worker SAB when epoch changes.
```

**Region graph:** `nodesMap` / hull repack live only on the worker. Main mirrors CSR for debug and replan **result** assembly — not mode selection.

**Still on main:** `syncGridTopologyCaches` before nav sync; `_collectHopRegionPairs` for portal/boundary reconnect; endpoint snap before `requestPath`.

**Separate copy:** flow field still uses its own `sabObstacle`.

---

## Done

### Region graph cutover

- Worker-only `buildRegionGraphFull` / `patchRegionGraph`.
- Main path removed: no `HierarchicalNavigator`, no main graph upload on edit.
- `NavigationService` serializes nav + graph sync on `_workerNavGraphSyncChain`.
- `sabCellToRegionIdx` on worker; debug via `getRegionGraphDebugView`.

### Replan mode on worker

- `prepareHpaReplanPrep` runs on worker at replan start (reads worker `cellToRegion` + persist CSR).
- Main `requestPath` sends snapped endpoints + `graphEpoch` only; worker returns `replanMode` on `hpaDone`.
- Main `_buildReplanResultPrep` uses mirrored meta only to assemble steering waypoints after the worker plans.

### Tile Lab / cleanup

- `initTileLabWorld` startup gate; lazy HPA* Grid overlay (`ensureLabPathDebugCache`).
- Dead upload helpers removed; `MAX_HPA_GRAPH_NODES` in `HpaPathWorker.js`.

---

## Remaining work

### Nav derivation on worker

Stop requiring main `navCardinalOpen` / `vertexPassability` as the pack source for HPA. Worker derives passability + octile in the expanded hull from sim, same modules, worker thread.

### Boundary hops

Worker discovers hop edges during hull patch; drop main `_collectHopRegionPairs` / `connectRegionIdxPairs` posts.

### Regression tests (not started)

- Rail maze single-delete; cavern add/delete cycle — path matches fresh load.
- Edit → replan without refresh; epoch mismatch does not silently use stale graph.

---

## Later (not blocking)

- **Shared sim SAB** — optional zero-copy sim read on worker.
- **Flow field** — read worker nav blocked; drop third `sabObstacle` copy.
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
