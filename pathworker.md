# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** ~**92%** of the north star. Worker derives cardinal/vertex/octile topology from sim SABs, wires portal hop abstract edges inline on region patch/full build, and runs one-shot replan. Main still bakes hop CSR from `boundaryNavHops`, runs `syncGridTopologyCaches` for live `grid.canStep`, and mirrors persist CSR for debug overlay + waypoint assembly. Flow field still owns a separate `sabObstacle` copy.

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

Spatial topology decoupling before the worker cutover:

- **G1** — `portalSlotIndex`, `vertexPassability`, `syncGridTopologyCaches` spine; Spatial ⊥ Sandbox for grid nav.
- **G2** — `boundaryNavHops.js` (Pathfinding) + `boundaryNavSync.js` (Sandbox policy); old `boundaryNavIndex` deleted.
- **G3** — `gridCellTopology.js` (queries) + `World/wallGridBake.js` (3D bake); `wallGridCells.js` deleted.
- **Naming** — `gridCellTopology` exports match `NavGraph.js` glossary.

---

## Worker rewrite (done)

### Nav + replan SABs

- `HpaPathWorker` + `HpaWorkerEntry`: nav snapshot SABs (`blocked`, sim slices, cardinal, vertex, hop CSR, octile), 512 replan slots, async `HpaPathSession`.
- One-shot `runReplan` on worker (temp connect → local or abstract A* → stitch); no per-candidate worker round-trips.
- `prepareHpaReplanPrep` on worker; main sends endpoints + `graphEpoch`, reads `replanMode` on `hpaDone`.
- Unified `replanHpaNavPath` for game + sandbox; sandbox keeps path across retarget (`markTargetChanged`).

### Region graph on worker

- Worker-only `buildRegionGraphFull` / `patchRegionGraph` / `rebuildDamagedRegionGraph`.
- `wireNavHopRegionEdges` after repack — portal/boundary hop abstract edges in the same graph patch (no second `connectRegionIdxPairs` message).
- `NavigationService` serializes nav + graph sync on `_workerNavGraphSyncChain`.
- Tile Lab HPA* Grid reads worker SAB via `getRegionGraphDebugView` (lazy bake on toggle).

### Tile Lab hygiene

- Engine loop owns canvas draw; sandbox `sync()` → panel only (`setUiSync`).
- Map overview repaints on edit / camera / layout — not every sim frame.

---

## Worker cutover PRs (done)

| PR | Summary |
| --- | --- |
| **W1** | Worker derives cardinal/vertex/octile from sim SABs (`navSimView`, `recompute*Into`); main packs raw grid/floor/edge slices only. Edit spine: `onObstaclesChanged` only (no per-site `syncGridTopologyCaches`). |
| **W2** | `wireNavHopRegionEdges` on worker after region patch/full build; deleted `_collectHopRegionPairs`, `reconnectBoundaryHopRegionPairs`, and `connectRegionIdxPairs` worker message. |
| **Fix** | `navSimView` `edgeStore.get` reads live `edgeStore.pool` so passage `powered` updates reach worker topology (forcefields + portal mouth rules). |

---

## Current architecture

```text
Edit / init on main:
  grid / edgeStore / passage power change
  → NavigationService.onObstaclesChanged(bounds)
      → syncGridTopologyCaches (main grid.canStep cache only)
      → syncBoundaryNavIndex when portal hop table changes (Sandbox policy)
      → pack sim slices + hop CSR into worker SABs
      → buildRegionGraphFull or patchRegionGraph
          worker: rebake topology → wireNavHopRegionEdges → writeRegionGraphToSab

Replan:
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + mirrored graph meta
```

**Still on main:** `buildBoundaryNavHops` + `bakeHopCsr`; `syncGridTopologyCaches`; endpoint snap before `requestPath`; mirrored persist CSR; flow `sabObstacle` (third nav copy).

---

## Next 2 PRs

### PR3 — Regression harness + flow/nav dedup

Pathfinding behavior is now split across worker topology, worker region graph, main hop CSR, and a separate flow-field obstacle buffer — exactly the kind of setup where a small invalidation bug shows up as “paths walk through powered forcefields until refresh.” Automated fixtures are the guardrail before any further worker moves. Target cases: rail-maze single-delete (path stable vs cold load), cavern add/delete cycle (patch path matches full rebuild), edit → replan without refresh, epoch mismatch (stale replan discarded, no silent stale-graph route), and portal link/power toggles (hop CSR + abstract edge present after one sync chain).

In the same pass, align flow field with worker nav truth: flow BFS should consume worker `sabBlocked` / nav snapshot (or a single shared blocked SAB owned by `HpaPathWorker`) and drop `FlowFieldGrid.sabObstacle` as an independent main-side bake. That removes the third copy, simplifies invalidation (one blocked grid epoch), and makes Tile Lab flow vs HPA debug overlays consistent under edits. Wire tests into whatever runner the repo already uses for grid fixtures — goal is CI signal, not a new harness framework.

### PR4 — Worker hop CSR + boundary nav pack

Today main still runs `buildBoundaryNavHops` (Sandbox portal policy via `evaluatePortalStepEntry`) and `bakeHopCsr` on every nav sync, then copies hop offsets into worker SABs. That keeps hop discovery tied to main-thread grid mutation and duplicates work on large maps — the same smell PR1 removed for cardinal/vertex. Move hop CSR derivation onto the worker: pack minimal hop inputs (portal link keys, powered flags, mouth/back geometry already in sim edge pool) and either port `buildBoundaryNavHops` math to a worker-safe entry or post a compact hop descriptor table built at the Sandbox policy boundary once per `boundaryNavEpoch`.

After worker owns hop CSR, delete main `bakeHopCsr` from `HpaPathWorker` sync paths and slim `syncBoundaryNavIndex` to bump epoch + invalidate only (no separate reconnect hook). Region graph already wires hop edges via `wireNavHopRegionEdges` over `forEachNavHop`; local A* and replan stitch already consume hop CSR on the worker — this PR completes “one nav snapshot” for walk + hop expansion. Optional stretch in the same PR: lazy main `syncGridTopologyCaches` from worker snapshot for diagonal `grid.canStep` (E3 endgame), or defer that to Later.

---

## Later (not blocking)

- **Shared sim SAB** — optional zero-copy sim read on worker without per-sync `edgePool` postMessage clone.
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
- **Mass path overlays** in Tile Lab (all active HPA movers, not selected prop only).
- **Main canStep from worker snapshot** — drop duplicate main topology bake if gameplay reads worker SAB lazily.
