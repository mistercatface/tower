# Path worker

HPA click-to-move on big maps. **Main requests a path; worker plans and stitches it.** Main applies waypoints and steers — no A*, stitch, or graph surgery on the click hot path.

---

## Worker vs main

| | Worker | Main |
|---|--------|------|
| **Replan** | Abstract A*, temp-connect, per-leg local A*, stitch | `requestPath` → await result |
| **Nav octile** | Bakes from shared SABs; `navView` for A* | Packs topology into SABs on edit; reads zero-copy views for flow/debug |
| **Path output** | Writes cell path + abstract idx to slot SABs | `applyHpaReplanResult`; steer/overlay from SAB (`hpaPathSlot.js`) |
| **Abstract graph** | Persist CSR in SABs; A* at replan time | Owns `HierarchicalNavigator.nodesMap`; `rebuildDamagedArea` on edits; `packHpaGraphForWorker` on `graphEpoch` bump |
| **Region assignment** | — | Voronoi chunks (`generateVoronoiRegions`) on init; incremental merge/split on edits |
| **Portal traverse** | — | Crossing grant, physics, hop mouth handling |

**Click path today:** `requestPath` → await nav/graph sync if stale → worker replan + stitch → main apply from slot SAB.

**Edit path today:** main `rebuildDamagedArea` + `patchNavTopology(dirtyBounds)` → worker octile patch → `syncAbstractGraph`.

---

## Done

- Worker-owned stitch (`hpaStitch.js`); main never stitches on replan hot path
- `HpaPathWorker.requestPath` + SAB path-follow (`pathSlot`, `pathLen`)
- No octile mirror-back; `getNavSnapshotView()` zero-copy SAB views
- Slim replan payload; temp-connect candidates derived on worker (`hpaReplanPrep.js`)
- Edit reconnect is cost-only (no `edge.path`; worker local A* at stitch)
- Incremental nav topology: `patchNavTopology(dirtyBounds)` with coalesced rects; full sync only on init / no bounds / grid resize
- Portal hop follow: SAB path clamps at hop mouth; no steer-to-exit across hop edge
- Scene sidebar: bulk cavern terrain not listed per-voxel (was a separate freeze)

---

## Still to do

### Region graph (biggest gap)

Incremental `rebuildDamagedArea` merges opened cells into neighbor regions and moves the centroid — it does **not** subdivide oversized regions or rerun Voronoi in a large erased area. Carving into existing walkable space can leave one region with hundreds of cells while HPA expects ~`maxCellsPerChunk` (64).

**Next:** subdivide after merge, or localized Voronoi regen in dirty hull; longer term `patchRegionGraph` on worker (main stops owning `nodesMap` surgery).

### Graph + data on worker

- Move region graph build/patch off main (`patchRegionGraph`)
- Incremental hop CSR (dirty-only; today full O(cells) repack on patch)
- Worker-owned graph — main stops `packHpaGraphForWorker` on every edit epoch

### Correctness / features

- Portal abstract edge cost: `_connectRegionPair` uses centroid Chebyshev, not hop cost 1
- Belt transfer edges (same machinery as portal hops)
- `canStep` / hops in edit-time split (`_splitRegionIfDisconnected` is cardinal-only today)
- Partial paths: `maxLegs` / `maxCells` policy on `requestPath`

### Other

- Sidebar render incremental (`sandboxToyUi.js`) — editor jank, orthogonal to path worker

---

## Nav model (reference)

```
Reachability = LocalWalk (octile / canStep)  ∪  Transfers (hop CSR)
Physics      = portal grant, belts, collision — separate from path graph
```

Forcefields → `canStep` filters. Portals → hop CSR + region adjacency. Belts (target) → transfer edges like portals.

---

## Rules

- No mirror-back; SAB views only
- No full-grid topology repack scattered across invalidation handlers — one `patchNavTopology` entry
- No in-memory migration shims — refresh is the migration
- Extend `Libraries/Pathfinding/` — no parallel worker copies

## Don't regress

- Scene list must not enumerate bulk terrain voxels
- No dual nav bake pipelines

---

## No main-thread fallbacks

**This is non-negotiable.** If the worker path is missing, stale, or slow, main does **not** pick up the work.

- No `HierarchicalNavigator.computeCellPath`, `runLocalAStar`, or `stitchAbstractCellPath` on the click/replan hot path
- No "just this once" sync bake that mirrors octile back to main for convenience
- No silent retry on main when `requestPath` returns null or a slot is empty — surface the failure or await the worker; do not reroute to main A*
- No edit-time local A* for graph reconnect (cost-only edges + worker stitch at replan is the contract)
- Stale epoch → refuse or await worker patch/sync; never plan against a graph or nav view main rebuilt locally

Main thread role stays **request, apply, steer, physics** — not pathfinding CPU. Any fallback reintroduces the freeze pattern we removed and masks worker bugs instead of fixing them.

---

## Next PR — region graph repack on carve

**Problem:** `rebuildDamagedArea` merges newly opened cells into an adjacent region and moves its centroid. It never subdivides. Erasing walls into existing walkable space can leave one HPA region with hundreds of cells while the abstract graph still assumes chunk-sized (~64 cell) regions. Nav octile is correct; abstract routing is wrong.

**Scope:** After `_assignOpenedCells` and merges, subdivide any region in the dirty hull that exceeds `maxCellsPerChunk` — reuse `floodFillRegion` / Voronoi seeding locally inside the expanded damage box, not a full-grid regen. Reconnect abstract edges for touched regions only (same cost-only `_reconnectRegionEdges` pattern). Escalate to localized `generateVoronoiRegions` in the hull when opened-cell count or merge size crosses a threshold. Still on main; still `syncAbstractGraph` to worker afterward.

**Acceptance:** carve a large box into cavern wall → region count grows appropriately, no single region >> 64 cells, warm click `requestPath` still works; no new main-thread A* on click or edit reconnect.

## After that

Move region graph maintenance to the worker (`patchRegionGraph`): main sends dirty rect + epoch, worker patches assignment and persist CSR incrementally, main drops `rebuildDamagedArea` and stops repacking the full graph on every edit. Then portal hop cost on abstract edges, incremental hop CSR, belt transfer edges, and partial-path policy — same pipe, tunable knobs.

