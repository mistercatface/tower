# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** done — north star table holds. Worker owns walkability (octile + hops), region graph, abstract replan, and flow-field blocked reads. Main packs sim slices + passage-network policy, notifies dirty bounds, applies steering. `ensureBoundaryNavHops` remains draw-only glue for hop overlay geometry.

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
| **W3** | Flow field reads worker `sabBlocked` via `flowToNavIdx`; octile neighbors from worker snapshot; dropped `FlowFieldGrid.sabObstacle`. |
| **W4** | Attempted worker hop CSR via `navSimHopBake` + `edge.networkId`; reverted — worker hop gate diverged from sandbox passage-power policy, portals broke. |
| **W5** | Worker hop CSR via packed `passageNetworkKeys` / `passageNetworkIds`; `bakeHopCsrOnSim` on worker; deleted `_packNavHopCsr`. Portal gate uses packed policy + mouth geometry — not cloned `edge.powered`. |
| **W6** | `grid.canStep` reads worker `gridNavSnapshot` SAB view (`snapshotCanStep` + `snapshotCanBoundaryHop`); removed `syncGridTopologyCaches` from `NavigationService.onObstaclesChanged`. |
| **W7** | Deleted `_mirrorGraphFromSab`; `getGraphMeta` / debug read persist CSR directly from worker SABs. |
| **Fix** | `navSimView` `edgeStore.get` reads live `edgeStore.pool` so passage topology updates reach worker; power/link policy packed per sync because `postMessage` clones edge objects. |

---

## Current architecture

```text
Edit / init on main:
  grid / edgeStore / passage power change
  → syncPassagePowerNetwork (sets grid._passagePoweredKeys / _passageNetworkIdByKey)
  → NavigationService.onObstaclesChanged(bounds)
      → pack sim slices + passageNetworkKeys/Ids into worker SABs
      → buildRegionGraphFull or patchRegionGraph
          worker: rebake topology + hop CSR → wireNavHopRegionEdges → writeRegionGraphToSab
      → grid.gridNavSnapshot = worker SAB view

Replan:
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + SAB graph meta views

Walk / collision:
  grid.canStep → snapshotCanStep + snapshotCanBoundaryHop on gridNavSnapshot
```

**Stays on main forever (OK):** passage-power compute (`syncPassagePowerNetwork`); endpoint snap; sim writes; steering; lazy `ensureBoundaryNavHops` for hop overlay draw only.

---

## Deferred

### Regression harness (was PR3)

Automated fixtures for rail-maze delete, cavern add/delete cycle, edit → replan without refresh, epoch mismatch, portal link/power toggles — wire when adding CI grid fixtures.

---

## Later (post north star)

- **Shared sim SAB** — optional zero-copy sim read on worker without per-sync `edgePool` postMessage clone.
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
- **Mass path overlays** in Tile Lab (all active HPA movers, not selected prop only).
