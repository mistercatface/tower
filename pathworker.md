# Path worker

HPA pathfinding on large maps — worker owns nav graph mutation and replan; main owns sim writes and steering.

**Status:** ~**85%** of the north star. Worker owns octile/cardinal/vertex topology, region graph, abstract replan, and flow-field blocked reads. Main still bakes hop CSR (`ensureBoundaryNavHops` → `bakeHopCsr`), runs `syncGridTopologyCaches` for live `grid.canStep`, and mirrors persist CSR for debug + steering glue. **Three PRs (PR5–PR7) finish authority cutover** — see below.

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
| **W4** | Attempted worker hop CSR via `navSimHopBake` + `edge.networkId`; reverted — worker hop gate diverged from sandbox passage-power policy, portals broke. Main `_packNavHopCsr` restores hop CSR before worker sync until PR5. |
| **Fix** | `navSimView` `edgeStore.get` reads live `edgeStore.pool` so passage `powered` updates reach worker topology (forcefields + portal mouth rules). |

---

## Current architecture

```text
Edit / init on main:
  grid / edgeStore / passage power change
  → NavigationService.onObstaclesChanged(bounds)
      → syncGridTopologyCaches (main grid.canStep cache only)
      → syncBoundaryNavIndex when portal hop table changes (epoch bump only)
      → main: ensureBoundaryNavHops + bakeHopCsr → hop SABs
      → pack sim slices into worker SABs
      → buildRegionGraphFull or patchRegionGraph
          worker: rebake topology → wireNavHopRegionEdges → writeRegionGraphToSab

Replan:
  main: resolveSnappedPathEndpoints → requestPath(endpoints, graphEpoch)
  worker: prepareHpaReplanPrep → plan + stitch → cell path in slot SAB
  main: buildHpaReplanResult from worker replanMode + mirrored graph meta
```

**Still on main (PR5–PR7 removes these):** hop policy + CSR pack; `syncGridTopologyCaches`; mirrored persist CSR; lazy `ensureBoundaryNavHops` for overlay (until PR7 or kept as draw-only glue). **Stays on main forever (OK):** endpoint snap before `requestPath`; sim writes; steering application.

---

## Finish line — 3 PRs to north star

### PR5 — Hops on worker (policy pack, not edge guesswork)

Sandbox passage-power and portal pairing policy stays on main — that is correct. What failed in W4 was expecting the worker to re-derive that policy from `edge.networkId` on a cloned edge pool without a stable wire format. PR5 packs the **output** of that policy at the sandbox boundary once per nav epoch: e.g. compact `poweredKeys` + `networkIdByKey` (or a dense per-conductor-edge network id table keyed by `canonicalEdgeCellKey`) in the nav sync message alongside sim slices. Worker `bakeHopCsrOnSim` consumes that table for `canLinkPortalsOnNetwork`-equivalent checks; delete `_packNavHopCsr` / main `bakeHopCsr` from `HpaPathWorker` sync paths.

Main may still lazy-build rich `boundaryNavHops` (owner/partner geometry) for path overlay draw until PR7 — that is presentation glue, not pathfinding authority. Acceptance: linked portals on a shared energized passage network produce identical hop CSR on worker vs today’s main bake; HPA replan routes through portals without refresh; no duplicate hop bake on the nav sync hot path.

### PR6 — One walkability truth (`grid.canStep` from worker snapshot)

Today every edit runs `syncGridTopologyCaches` on main so gameplay, collision, and steering can call `grid.canStep` without awaiting the worker. That is the second full topology bake and the main reason edits still feel “main-heavy” after W1–W3. PR6 drops that hot-path bake: after `onObstaclesChanged` completes its worker sync chain, main reads octile/blocked rules from the worker nav snapshot view (or bound SAB views) for diagonal steps and boundary checks — lazy on first use after sync, not a parallel recompute.

`NavigationService.onObstaclesChanged` stops calling `syncGridTopologyCaches`; call sites that need walkability either await worker nav ready or read through a thin snapshot adapter on `WorldObstacleGrid`. Acceptance: edit → replan without refresh; diagonal `canStep` matches worker topology under forcefields/portals/rails; no `syncGridTopologyCaches` on the edit spine (retain only if a real persistence boundary needs it — document if so).

### PR7 — Delete mirrors; main notifies only

With PR5–PR6 done, worker SABs are the sole nav authority for walk, hops, regions, and replan. PR7 removes redundant main-side copies: mirrored persist CSR used only to feed debug that can read worker SABs directly (`getRegionGraphDebugView` pattern); slim `HpaPathWorker` graph meta to what steering actually needs (slot path SABs + epoch), not a second abstract graph. `NavigationService` wire shrinks to dirty rect + epoch + sim slice pack — no hop vocabulary, no reconnect hooks, no main-side nav graph mutation.

Rich hop overlay (`boundaryHopDrawGeometry`) either reads a small hop-metadata view exported from worker CSR + edge pool, or keeps lazy `ensureBoundaryNavHops` strictly for draw — not for pathfinding. Acceptance: north star table holds without caveats; Tile Lab HPA debug + flow overlay consistent with worker replan; `pathworker.md` status → done.

---

## Deferred

### Regression harness (was PR3)

Automated fixtures for rail-maze delete, cavern add/delete cycle, edit → replan without refresh, epoch mismatch, portal link/power toggles — wire when adding CI grid fixtures. Recommended before or alongside PR5; not a fourth authority PR.

---

## Later (post north star)

- **Shared sim SAB** — optional zero-copy sim read on worker without per-sync `edgePool` postMessage clone.
- **Portal abstract edge cost** — centroid Chebyshev today, not hop distance.
- **Belt transfer edges** in region adjacency.
- **Partial paths** — `maxLegs` / `maxCells` on `requestPath`.
- **Mass path overlays** in Tile Lab (all active HPA movers, not selected prop only).
