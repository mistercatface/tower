# Path worker — status & plan

HPA click-to-move on big maps.

## End goal

**Main thread asks; worker answers.** An entity on the main thread should only request a path (from → to) and receive a ready-to-steer result. No graph surgery, no local A*, no stitch, no nav snapshot bake on the main thread in that pipeline.

Whether the worker returns a full cell path, the next N waypoints, or abstract nodes + one leg is a **policy knob** on the same pipe — not a separate architecture. Establish the full worker-owned pipeline first; tune granularity later.

**Second pillar:** minimize data moving between main and worker. Prefer worker-resident state and zero-copy SAB views over repacking and mirroring. Treat lazy init and sync-on-update as a fallback — easy to accidentally sync on every edit and throttle the whole game.

```
Main:  requestPath({ from, to, navEpoch }) → await PathResult
Worker: nav snapshot + region graph + replan + stitch → PathResult (cells, hops, abstract)
Main:  applyPathResult(navState, result)   // assign waypoints only
```

Cross-thread ideal: main sends **coordinates + epoch**, worker returns **path slot index or compact PathResult** — not multi-MB snapshot round-trips.

---

## What was actually freezing the game (fixed)

**Not pathfinding.** The Scene sidebar listed **every wall voxel** (`listPlacedVoxelWalls` → full grid scan → one DOM row per cell). Big cavern gen = tens of thousands of rows; every `sync()` wiped `innerHTML` and rebuilt the whole panel → layout thrash / apparent freeze.

**Fix:** Scene list shows **hand-tracked** voxel placements only (`listTrackedVoxelWalls` in `sandboxSession.js`). Bulk cavern/map-gen terrain stays on the grid, not in the Scene list. Export/import unchanged.

---

## Worker refactor — current state

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Stop clearing path on click (sandbox) | **Done** | `markTargetChanged` in `rollToCursorHpaNav.js` |
| 2 | One-shot worker replan | **Done** | `runOneShotReplan` — single `replan` IPC per request |
| 3 | Abstract-first + first-leg apply | **Done** | `abstractReady` → region waypoints; first leg on `hpaDone`; full stitch via `queueMicrotask` on **main** |
| 4 | Persistent abstract graph on worker | **Partial** | Worker CSR in SABs; **main** still owns `nodesMap`, `edge.path`, and rebuilds on wall edits |
| 5 | Snapshot off click path | **Partial** | Worker bakes octile; main still packs topology + mirrors full snapshot back; edit path still sync-bakes |
| 6 | Worker-owned path response | **Not done** | Worker returns `abstractIdx` + temp legs; **main** stitches via `stitchAbstractLegRange` / `_finishFullStitch` |
| 7 | Edit-time graph off main | **Not done** | `rebuildDamagedArea` → `_connectRegionPair` → sync `runLocalAStar` + `ensureGridNavSnapshot` on main |
| 8 | Leg advancement / partial path policy | **Not done** | Full replan every target change; granularity tunable once #6 is done |
| 9 | Minimal main ↔ worker data | **Not done** | Main packs topology + mirrors full octile snapshot back; graph repack on epoch; path legs cross as main `edge.path` + temp-leg maps |

**Net:** Replan CPU mostly moved to worker. **Path materialization and graph maintenance are still split** — main owns the nav world model (`nodesMap`, `edge.path`, stitch, edit reconnect). **Data still bounces both ways** — pack on main, bake on worker, copy back to main. That split is the remaining work.

---

## Data transfer — second priority (P1)

**Goal:** the least data passed between main and worker, period. Every crossing should be justified.

### Preference ladder (best → acceptable → avoid)

| Tier | Approach | When |
|------|----------|------|
| **1 — Worker-only** | Nav snapshot, region graph, leg geometry live on worker; main never holds a copy | Default for pathfinding hot path |
| **2 — SAB, zero-copy** | Main and worker share one buffer; main writes dirty topology slices, worker reads views, writes results into slot pools | Grid edits, path output — already started (`sabPathColsPool`, persist graph SABs) |
| **3 — Small messages** | `postMessage` carries only `{ type, slot, epoch, requestId }` — no typed arrays in payload | Replan done, graph patched |
| **4 — Lazy init / sync-on-update** | Build or refresh worker state only when something changes | **Fallback only** — see below |

### Why sync-on-update is the weak option

"Sync when the grid updates" sounds efficient but **update is not one event** in this codebase. Any of these can invalidate nav topology:

- Wall voxel stamp/remove (`wallGridRevision`)
- Floor belt / button / pad edits
- Portal link or passage power changes (`boundaryNavEpoch`)
- Forcefield trip / power network flood
- Cavern gen, import, room resize

If each handler calls "ensure worker is fresh," you get **death by a thousand full repacks** — main scans grid → copies blocked + cardinal + vertex + hops into SABs → worker rebakes octile → main mirrors octile back. That pattern already throttles on busy edits even when click path is "async."

**Better model:** worker holds authoritative nav + graph; main sends **dirty rect + revision bump** (tiny message). Worker patches incrementally. Main keeps **epoch integers only** (`navEpoch`, `graphEpoch`) to detect staleness — not duplicate megabyte arrays.

### Current waste (target for removal)

| Transfer | Direction | Size / cost | Fix |
|----------|-----------|-------------|-----|
| `packBlockedFromGrid` + hop CSR pack | main → SAB | O(cells) per topology change | Worker builds from topology SABs main already maintains; or main writes only dirty cell bitmask |
| `_mirrorNavSnapshotToMain` | worker → main | O(cells × 8) **full copy** after every bake | Delete for HPA path; flow/debug reads worker SAB or separate flow worker |
| `packHpaGraphForWorker` | main → SAB | O(nodes + edges) per graph epoch | Worker owns graph after PR2; main never repacks |
| `nodesMap.edge.path` | main only | O(path cells × edges) duplicated conceptually | Worker stores legs at stitch or in edge-path pool SAB |
| `abstractReady` + `hpaDone` | worker → main | abstract idx + temp legs read from SAB | OK if main only **views** slot SABs to apply waypoints — bad if main copies into new arrays unnecessarily |
| `_readTempLegs` → `Map` | SAB → main heap | Rebuilds JS objects per replan | Main views SAB directly in apply or worker sends world waypoints in path slot |

### Rules

- **No mirror-back** unless a main-thread consumer is proven and can't use a SAB view.
- **No repack on click** — replan message is `{ slot, startCol, startRow, targetCol, targetRow, navEpoch, graphEpoch }`.
- **Epoch not snapshot** — main checks `grid.navTopologyRevision` / `graphEpoch`; worker refuses stale replans instead of silently syncing.
- **Path out is bounded** — `MAX_HPA_PATH_LEN` slot pool; main maps cells to world in apply only (cheap), doesn't clone path into a second structure.
- **Expand SAB pools, not postMessage payloads** — new fields get a documented layout in `hpaAbstractFlat.js` or path slot meta, not serialized objects.

---

## Architecture (today)

```
Click → HpaPathSession._drainReplan
      → prepareWorkerReplan (main: scan nodesMap)
      → await nav sync (main packs SABs → worker bake → main mirrors snapshot)
      → await graph sync (main packHpaGraphForWorker — costs only, no leg geometry)
      → worker replan (abstract A* + temp-connect local A*)
      → abstractReady: main apply region centroids
      → hpaDone: main stitchAbstractLegRange (leg 0) → queueMicrotask full stitch on main
      → applyHpaReplanResult / expandBoundaryHopsInCellPath (main)
```

**Warm click:** no `rebuildDamagedArea`, no Scene grid scan — but still main stitch + graph/apply.

**Wall edit:** `onObstaclesChanged` → `rebuildDamagedArea` on main (region surgery + local A* reconnect) → worker nav/graph reschedule.

### Still on main (must move)

| Work | Where today | Why it blocks end goal |
|------|-------------|------------------------|
| Region graph + `edge.path` | `HierarchicalNavigator.nodesMap` | Worker only gets CSR costs; stitch needs leg geometry on main |
| Path stitch | `stitchAbstractLegRange`, `HpaPathSession._finishFullStitch` | Worker writes `writeCellPath(null)` |
| Edit reconnect A* | `_connectRegionPair` in `rebuildDamagedArea` | Sync local A* per neighbor on every wall change |
| Nav snapshot mirror | `_mirrorNavSnapshotToMain` | Full octile copy back after worker bake — **P1 waste** |
| Topology repack | `scheduleNavTopologySync` | Main repacks full blocked + hops before every worker bake — **P1 waste** |
| Graph repack | `packHpaGraphForWorker` | Full CSR copy on graph epoch — **P1 waste** |
| Hop expand / apply | `hpaPathPlan.js`, `boundaryNavHops.js` | Fine on main if cheap — keep as apply-only |

---

## Priority order

### P0 — Worker returns the path (establish the pipe)

1. **Worker stitch + cell path output** — move `stitchAbstractLegRange` logic into `Libraries/Pathfinding`; worker runs it against worker nav view + persist graph, writes final cells to path slot SAB (`writeCellPath` non-null). Main drops `_finishFullStitch` / main-thread stitch on replan hot path.
2. **Single apply entry** — main receives `PathResult` (cells via SAB view or compact read); `applyHpaReplanResult` stays the only mutation of `navState.path`.

### P1 — Minimize main ↔ worker data

3. **Worker-authoritative nav + graph** — no `_mirrorNavSnapshotToMain`; no main `gridNavSnapshot` on HPA hot path. Main keeps epoch counters only.
4. **Incremental topology push** — wall/floor/boundary edits send dirty bounds + revision, not full-grid repack. Worker patches its nav view; avoid sync-on-every-`invalidateGridNavSnapshot` handler chaining into full rebake.
5. **Path via slot SAB only** — `hpaDone` / `abstractReady` signal slot + meta; main reads `sabPathColsPool` / `sabAbstractIdxPool` views to apply — no `_readTempLegs` → `Map` → restitch on main.
6. **Replan payload slim** — one `replan` message: coords, epochs, slot id. No candidate arrays or graph blobs in `postMessage` (worker derives candidates from its own graph).

### P2 — Graph + snapshot maintenance off main

7. **Edit-time region graph on worker** — `rebuildDamagedArea` / `_connectRegionPair` local A* on worker (dirty-bounds patch). Main sends bounds + topology epoch; worker bumps `graphEpoch`.
8. **Drop main `edge.path` retention** — legs computed at worker stitch time or stored in worker edge-path SAB pool; main `nodesMap` not on hot path.

### P3 — Policy + cleanup (same pipe, tunable knobs)

9. **Leg advancement / partial paths** — `requestPath` accepts `maxLegs` or `maxCells`; worker returns prefix from same slot pool. Not a new pipeline.
10. **Thin main API** — `HpaPathSession` / `HpaPathWorker` collapse to `requestPath` + `applyPathResult`; slim `HierarchicalNavigator` on main to editor-only or remove from hot path.
11. **Sidebar render** — incremental `sandboxToyUi.js` (orthogonal but still editor jank).

---

## Code organization (libraries, reuse, clarity)

**Extend existing modules — no parallel implementations.**

| Domain | Own it in | Reuse / extend |
|--------|-----------|----------------|
| A* | `AStar.js` | `runLocalAStarFlat`, `runAbstractAStarFlat` — worker + main import same |
| Nav snapshot | `GridNavSnapshot.js` | `buildOctileNeighborsFromTopology`, hop CSR — worker entry imports, doesn't duplicate bake |
| Abstract CSR | `hpaAbstractFlat.js` | `packHpaGraphForWorker` — extend for leg path pools when needed |
| Region topology | `VoronoiRegions.js` | flood fill, adjacency — worker region build should call these, not fork |
| Hop waypoints | `boundaryNavHops.js` | `expandBoundaryHopsInCellPath` — apply on main from worker cell path |
| Path apply | `hpaPathPlan.js` | single apply surface; no stitch logic here |
| Nav state shape | `navSession.js` | `NavSessionState` typedef — one contract |

**New shared code belongs in `Libraries/Pathfinding/`** only when it's a coherent subsystem (e.g. `hpaStitch.js` for leg concat + abstract→cell resolution), not one-off worker copies. `Render/Navigation/HpaWorkerEntry.js` stays a thin host: init SABs, dispatch messages, import library functions.

**Patterns to enforce:**

- **Worker produces / main applies** — CPU on worker, `navState` mutation on main.
- **One pack format** — graph, legs, and path results use SAB layouts defined beside `hpaAbstractFlat.js`, not ad-hoc per message.
- **No duplicate stitch** — `appendCellLeg` today lives in worker entry; consolidate with `stitchAbstractLegRange`.
- **Fail fast** — no main-thread fallbacks that silently re-run A* if worker path is missing.
- **Epoch over copy** — main tracks `navEpoch` / `graphEpoch`; worker is source of truth for bulk data.
- **No mirror-back** — if main needs a byte, prefer `SharedArrayBuffer` view over `new Uint8Array(workerBuffer)`.
- **No sync-on-update sprawl** — one bounded `patchNavTopology(dirtyBounds)` entry from edits, not every invalidation handler scheduling a full rebake.

---

## 3-part PR plan

### PR 1 — Worker-owned stitch (`P0` + start `P1`)

**Goal:** `hpaDone` delivers a complete cell path in the path slot SAB; main never calls `stitchAbstractCellPath` on the replan hot path.

- Add `Libraries/Pathfinding/hpaStitch.js` — extract `stitchAbstractLegRange` / `_appendAbstractLeg` from `HierarchicalNavigator`; worker entry imports it.
- Worker replan: after abstract A*, stitch all legs on worker using worker nav view; write cells to `sabPathColsPool` / `sabPathRowsPool`.
- `HpaPathSession`: delete `_finishFullStitch` + `queueMicrotask` stitch; apply reads slot SAB views, does not rebuild temp-leg `Map`.
- `applyHpaReplanResult` maps slot cells → world waypoints only.

**Acceptance:** warm click — zero main-thread `stitchAbstract*`; path apply reads SAB views, no full path array clone unless required for `navState.path`.

### PR 2 — Worker-owned graph + stop mirror (`P1` + `P2`)

**Goal:** wall edit sends dirty bounds + epoch only; no `_connectRegionPair` / sync `ensureGridNavSnapshot` / `_mirrorNavSnapshotToMain` on hot path.

- Worker message `patchNavTopology { dirtyBounds, navEpoch }` — incremental nav bake on worker.
- Worker message `patchRegionGraph { dirtyBounds, graphEpoch }` — reconnect on worker via `VoronoiRegions` helpers.
- Remove `_mirrorNavSnapshotToMain` for HPA; main `obstacleGrid.gridNavSnapshot` not required for click-to-move.
- Replace `scheduleNavTopologySync` full repack with dirty-region writes into shared topology SABs (or worker pulls from grid SABs main already owns for sim).
- `replan` postMessage: coords + epochs + slot only.

**Acceptance:** stamp walls on 512×512 cavern — profiler shows no main `runLocalAStar`, `buildGridNavSnapshot`, or octile mirror alloc; postMessage payloads under 1 KB.

### PR 3 — Thin request/apply API + policy hooks (`P3`)

**Goal:** one obvious contract; partial paths are a parameter, not a fork.

- `HpaPathWorker.requestPath({ startX, startY, targetX, targetY, navEpoch, graphEpoch, maxCells? })` → slot index + meta (read path from SAB).
- `HpaPathSession` becomes thin wrapper: coalesce requests, call `requestPath`, `applyPathResult`.
- Optional `maxCells` / `maxLegs` — worker writes prefix into same slot pool.
- Worker derives temp-connect candidates internally — delete `prepareWorkerReplan` main scan.
- Remove dead main-path code; document SAB layouts in `hpaAbstractFlat.js`.

**Acceptance:** sandbox click path is epoch check → slim message → SAB apply; no `HierarchicalNavigator` on hot path.

---

## Non-goals / don't regress

- Scene list must **not** enumerate bulk terrain voxels again.
- No dual nav snapshot pipelines (main sync bake + worker bake) once P2 lands.
- No in-memory migration shims — refresh is the migration.
- No new micro-modules — helpers go into existing Pathfinding libs per workspace rules.
- No "smart" lazy sync that repacks the whole grid from scattered `invalidate*` call sites — one explicit patch path only.
