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
- No main-thread A* / stitch fallback on missing worker path
