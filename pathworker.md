# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** worker owns region graph build/patch, one-shot replan (local + abstract + stitch), and replan mode selection. Main still bakes `navCardinalOpen` / `vertexPassability` before packing nav SABs and still scans boundary hops for abstract reconnect. Roughly **~85%** of the north star.

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
  → syncGridTopologyCaches (vertexPassability, navCardinalOpen on main)   ← still here
  → NavigationService.onObstaclesChanged(bounds)
      → pack nav slices into worker SABs (patchNavTopology / full sync)
      → buildRegionGraphFull or patchRegionGraph (worker)
      → reconnectBoundaryHopRegionPairs (main scans hops, worker connectRegionIdxPairs)   ← still here

Replan:
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + mirrored graph meta (waypoints only)

Debug (Tile Lab): checkbox on → ensureLabPathDebugCache when epoch/topology stale.
```

**Still on main:** `syncGridTopologyCaches` before nav pack; `_collectHopRegionPairs` + `connectRegionIdxPairs` follow-up post; endpoint snap before `requestPath`; mirrored persist CSR for debug overlay and waypoint assembly.

**Separate copy:** flow field can read worker nav snapshot, but still maintains its own obstacle buffer path in some code paths — not fully deduped.

---

## Next 3 PRs

### PR1 — Nav topology derivation on worker

Today every nav sync requires main to run `syncGridTopologyCaches` first, then `HpaPathWorker` copies `grid.navCardinalOpen` and `grid.vertexPassability` into SABs (and throws if sizes mismatch). That keeps pathfinding tied to live `WorldObstacleGrid` mutation helpers on the main thread and duplicates work on large maps.

Move derivation into the worker hull: on `buildNavSnapshot` / `patchNavTopology`, worker rebakes `blocked`, cardinal open bits, vertex passability, hop CSR, and octile neighbors inside the expanded patch rect from minimal sim inputs (cell heights, edge/passage occupancy, floor flags — not pre-baked caches). Main’s edit path becomes dirty bounds + epoch + raw slice copy; drop the hard dependency on main `navCardinalOpen` / `vertexPassability` as the pack source. Incremental patch should match full rebuild for the same grid state.

### PR2 — Boundary hop reconnect on worker

After a hull patch, portal/boundary hops can connect regions that the Voronoi repack alone does not wire. Main currently scans `forEachBoundaryHopCell`, builds region-index pairs from mirrored `cellToRegion`, and posts a second `connectRegionIdxPairs` message.

Fold that into `patchRegionGraphOnWorker` (and full build if needed): once `rebuildDamagedRegionGraph` finishes and `cellToRegion` is written, scan hop CSR inside the worker nav snapshot and call `connectRegionIdxPairs` before `writeRegionGraphToSab`. Delete `HpaPathWorker._collectHopRegionPairs`, `reconnectBoundaryHopRegionPairs`, and the extra graph-patch round trip. Tile Lab portal edits should reconnect abstract edges in one sync chain.

### PR3 — Regression harness + flow/nav dedup

Add automated repro cases called out in the plan but not started: rail-maze single-delete (path stable vs fresh load), cavern add/delete cycle (path matches cold rebuild), edit → replan without refresh, and epoch mismatch (stale replan discarded, no silent stale-graph path). Wire into whatever test runner the repo already uses for grid fixtures — goal is CI signal before further worker moves.

In the same pass, finish flow-field alignment with worker nav: flow BFS should read worker `sabBlocked` / nav snapshot only and drop the third standalone `sabObstacle` copy where it still exists. That closes the “one nav truth” loop left after PR1–PR2 and makes memory + invalidation behavior easier to reason about under load.

---

## Later (not blocking)

- **Shared sim SAB** — optional zero-copy sim read on worker (raw grid/edge slices without main-side cache bake).
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
- **Mass path overlays** in Tile Lab (all active HPA movers, not selected prop only).
