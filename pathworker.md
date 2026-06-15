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
| **Region assignment** | — | Voronoi chunks on init; incremental merge/split + repack on edits |
| **Portal traverse** | — | Crossing grant, physics, hop mouth handling |

**Click path:** `requestPath` → await nav/graph sync if stale → worker replan + stitch → main apply from slot SAB.

**Edit path:** main `rebuildDamagedArea` + `patchNavTopology(dirtyBounds)` → worker octile patch → `syncAbstractGraph`.

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
- **PR5 — Region repack on carve:** oversized regions subdivided after edit; large opens (`≥ 2 × maxCellsPerChunk`) trigger localized hull repack with distance-to-wall seeding; editor wall eraser tool for testing (`gen:erase`)

---

## Still to do

### Graph on worker

- `patchRegionGraph` — move region assignment + persist CSR patch off main
- Incremental hop CSR (dirty-only; today full O(cells) repack on patch)
- Main stops `packHpaGraphForWorker` on every edit epoch once worker owns graph

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

## PR5 post-mortem — region repack on carve

**Problem fixed:** carving walls merged opened cells into one neighbor region and only moved the centroid — HPA regions could balloon to hundreds of cells.

**Shipped (`HierarchicalNavigator.rebuildDamagedArea`):**
- `_createRegionFromCells` uses exported `floodFillRegion` with distance-to-wall seed order (same as init Voronoi)
- After assign/merge: `_subdivideOversizedRegionsInBox` splits any region in dirty hull with `cells.length > maxCellsPerChunk`
- Large carves (`openedCellCount ≥ 2 × maxCellsPerChunk`): `_repackRegionCellsInBox` removes all regions touching the hull and rechunks their cells
- Touched regions reconnect via existing cost-only `_reconnectRegionEdges`; still no main A* on edit path

**Editor test tool:** palette `gen:erase` — rect/circle/donut bounds on map overview (red overlay), **Erase walls in bounds** clears voxel walls + rail edges in shape (`eraseLabWallsInBounds`); does not delete props.

**Deferred from PR5:** `patchRegionGraph` on worker; `canStep`/hop-aware split; portal centroid cost.

**Acceptance:** carve large area → multiple ≤64-cell regions; `onObstaclesChanged` → `patchNavTopology` + `syncAbstractGraph`; click path unchanged.

---

## Next PR — `patchRegionGraph` on worker

Main sends dirty rect + `graphEpoch`; worker patches region assignment and persist CSR incrementally. Main drops `rebuildDamagedArea` and full `packHpaGraphForWorker` on every edit. Reuse PR4 coalescing pattern (`patchNavTopology`).

**After that:** portal hop cost on abstract edges, incremental hop CSR, belt transfer edges, partial-path policy — same pipe, no main-thread fallbacks.
