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
| 3 | Abstract-first apply | **Done** | `abstractReady` → region centroids; worker stitches full cell path; main applies from slot SAB |
| 4 | Persistent abstract graph on worker | **Partial** | Worker CSR in SABs; main still owns `nodesMap` and rebuilds on wall edits |
| 5 | Snapshot off click path | **Partial** | No octile mirror-back; flow uses `getNavSnapshotView()`; topology pack on epoch still on main |
| 6 | Worker-owned path response | **Done** | Worker stitches via `hpaStitch.js`; writes cell path to slot SAB; main reads + applies only |
| 7 | Edit-time graph off main | **Partial** | `rebuildDamagedArea` still on main; reconnect cost-only (no local A*, no `edge.path`) |
| 8 | Leg advancement / partial path policy | **Not done** | Full replan every target change; granularity tunable once #6 is done |
| 9 | Minimal main ↔ worker data | **Partial** | No mirror; slim replan payload; graph CSR repack on epoch still on main |

**Net:** Worker owns replan + stitch + nav octile read model. Main still packs topology into SABs on epoch change and owns region graph surgery on edits. No octile mirror-back; edit reconnect is cost-only.

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
| `_mirrorNavSnapshotToMain` | ~~worker → main~~ | **Removed** — `createWorkerNavSnapshotView` |
| Replan candidate arrays | ~~main → worker~~ | **Removed** — `hpaReplanPrep.js` on worker |
| `packHpaGraphForWorker` | main → SAB | O(nodes + edges) per graph epoch | Worker owns graph after PR2; main never repacks |
| `nodesMap.edge.path` | main only | O(path cells × edges) duplicated conceptually | Worker stores legs at stitch or in edge-path pool SAB |
| `abstractReady` + `hpaDone` | worker → main | abstract idx + temp legs read from SAB | OK if main only **views** slot SABs to apply waypoints — bad if main copies into new arrays unnecessarily |
| `_mirrorNavSnapshotToMain` | ~~worker → main~~ | **Removed** — `createWorkerNavSnapshotView` |
| Replan candidate arrays | ~~main → worker~~ | **Removed** — `hpaReplanPrep.js` on worker |

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
      → await nav sync if stale (main packs topology SABs → worker bake — no mirror-back)
      → await graph sync if epoch changed (main CSR pack)
      → worker replan (worker derives temp-connect candidates; slim postMessage)
      → abstractReady: main apply region centroids
      → hpaDone: main reads stitched cell path from slot SAB → applyHpaReplanResult
```

**Warm click:** no main stitch, no octile mirror, no `runLocalAStar` on edit reconnect.

**Wall edit:** `rebuildDamagedArea` on main (cost-only edges, no path arrays, no snapshot bake).


### Still on main (must move)

| Work | Where today | Why it blocks end goal |
|------|-------------|------------------------|
| Region graph + `edge.path` | `HierarchicalNavigator.nodesMap` | Graph build on main; worker stitches via per-leg local A* at replan time |
| ~~Path stitch~~ | ~~main~~ | **Worker-owned** (`hpaStitch.js` + `HpaWorkerEntry`) |
| ~~Nav snapshot mirror~~ | ~~`_mirrorNavSnapshotToMain`~~ | **Removed** — `getNavSnapshotView()` zero-copy SAB views |
| Edit reconnect A* | ~~`_connectRegionPair`~~ | **Cost-only octile** — worker local A* at stitch |
| Topology repack | `scheduleNavTopologySync` | Main still packs blocked + hops on epoch change (PR2 remainder) |
| Graph repack | `packHpaGraphForWorker` | On `graphEpoch` bump only — PR3 may move off hot path |
| Hop expand / apply | `hpaPathPlan.js`, `boundaryNavHops.js` | Fine on main if cheap — keep as apply-only |

---

## Priority order

### P0 — Worker returns the path (establish the pipe)

1. ~~**Worker stitch + cell path output**~~ — done (PR1).
2. ~~**Single apply entry**~~ — done; `_finishFullStitch` / `queueMicrotask` stitch removed.

### P1 — Minimize main ↔ worker data

3. ~~**Worker-authoritative nav read model**~~ — done: no mirror-back; flow + HNav use `getNavSnapshotView()`.
4. **Incremental topology push** — deferred: still full pack on `scheduleNavTopologySync`.
5. **Path via slot SAB only** — ~~`_readTempLegs` → Map~~ done; main still clones via `_readCellPath` → apply (PR3).
6. ~~**Slim replan payload**~~ — done: worker derives temp-connect candidates (`hpaReplanPrep.js`).

### P2 — Graph + snapshot maintenance off main

7. **Edit-time region graph on worker** — deferred: main still runs `rebuildDamagedArea` surgery; reconnect is cost-only.
8. ~~**Drop main `edge.path` on reconnect**~~ — done; worker stitches via per-leg local A*.

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
| Nav snapshot | `GridNavSnapshot.js` | `buildOctileNeighborsFromTopology`, `createWorkerNavSnapshotView`, hop CSR |
| Replan prep | `hpaReplanPrep.js` | temp-connect candidate collection on worker persist CSR |
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

### PR 1 — Worker-owned stitch (`P0` + start `P1`) — **Done**

**Goal:** `hpaDone` delivers a complete cell path in the path slot SAB; main never calls `stitchAbstractCellPath` on the replan hot path.

- Add `Libraries/Pathfinding/hpaStitch.js` — extract `stitchAbstractLegRange` / `_appendAbstractLeg` from `HierarchicalNavigator`; worker entry imports it.
- Worker replan: after abstract A*, stitch all legs on worker using worker nav view; write cells to `sabPathColsPool` / `sabPathRowsPool`.
- `HpaPathSession`: delete `_finishFullStitch` + `queueMicrotask` stitch; apply reads slot SAB views, does not rebuild temp-leg `Map`.
- `applyHpaReplanResult` maps slot cells → world waypoints only.

**Acceptance:** warm click — zero main-thread `stitchAbstract*`; path apply reads SAB views, no full path array clone unless required for `navState.path`.

### PR 2 — Worker-owned graph + stop mirror (`P1` + `P2`) — **Done (partial)**

**Shipped:** removed `_mirrorNavSnapshotToMain`; `createWorkerNavSnapshotView` + `getNavSnapshotView()`; flow reads worker SAB views; `_connectRegionPair` cost-only; worker derives temp-connect candidates (`hpaReplanPrep.js`); slim replan `postMessage`.

**Deferred:** `patchNavTopology` / `patchRegionGraph` on worker; incremental topology push; full graph off main.

**Acceptance met:** edit reconnect no `runLocalAStar` / `ensureGridNavSnapshot`; no octile mirror alloc on nav sync.


### PR 3 — Thin request/apply API + policy hooks (`P3`)

**Goal:** one obvious contract; partial paths are a parameter, not a fork.

- `HpaPathWorker.requestPath({ startX, startY, targetX, targetY, navEpoch, graphEpoch, maxCells? })` → slot index + meta (read path from SAB).
- `HpaPathSession` becomes thin wrapper: coalesce requests, call `requestPath`, `applyPathResult`.
- Optional `maxCells` / `maxLegs` — worker writes prefix into same slot pool.
- Worker derives temp-connect candidates internally — done in PR2 (`hpaReplanPrep.js`).
- Remove dead main-path code; document SAB layouts in `hpaAbstractFlat.js`.

**Acceptance:** sandbox click path is epoch check → slim message → SAB apply; no `HierarchicalNavigator` on hot path.

---

## Non-goals / don't regress

- Scene list must **not** enumerate bulk terrain voxels again.
- No dual nav snapshot pipelines (main sync bake + worker bake) once P2 lands.
- No in-memory migration shims — refresh is the migration.
- No new micro-modules — helpers go into existing Pathfinding libs per workspace rules.
- No "smart" lazy sync that repacks the whole grid from scattered `invalidate*` call sites — one explicit patch path only.
