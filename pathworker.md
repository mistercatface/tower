# Path worker

**~70%** — HPA click-to-move on big maps. **Main requests a path; worker plans and stitches it.** Main applies waypoints and steers — no A\*, stitch, or graph surgery on the click hot path.

The click/replan pipe is largely wired. What blocks “done” is **abstract graph integrity after edits** — incremental split/assign/reconnect leaves wrong region nodes, adjacent duplicate centroids, and edges that don’t match real `canStep` connectivity. The fix is **hull cut + rebuild** (recompute assignment in the dirty patch), not merge heuristics on stale state.

---

## Priorities (in order)

### 1. Graph CRUD — predictable edit semantics (~40%)

`HierarchicalNavigator.rebuildDamagedArea` must behave like a real CRUD layer: edit → graph matches navigable topology, no residue.

**Broken today**

- **Incremental surgery, not recompute** — `rebuildDamagedArea` splits, assigns opened cells, subdivides, and reconnects on top of old `nodesMap` / `cellToNode`. That leaves residue: adjacent duplicate centroids, regions spanning `canStep`-disconnected cells, stale abstract edges.
- **Repack only on huge carves** — `_repackRegionCellsInBox` (cut hull → `_createRegionFromCells`) runs only when `openedCellCount ≥ 2 × maxCellsPerChunk`. Rail deletes and small edits never get the clean rebuild path.
- **Assign orphans** — `_assignOpenedCells` mints 1-cell regions when flood fill can’t reach a neighbor through `canStep`; paired blue nodes beside an existing region.
- **Merge is init-only** — `mergeSmallRegions` runs on full Voronoi init, not on edits; incremental “merge passably connected” was patch-on-patch, not the target model.

**Target contract — hull cut + rebuild**

Define a **dirty hull** (edit bounds + `damagePadding` + nav topology margin). Inside the hull, region assignment is **recomputed from current walk topology**, not patched.

| Operation | Expectation |
| --------- | ----------- |
| **Add** wall/rail | Strip blocked cells; repack open cells in hull; reconnect boundary to exterior; prune unreachable from seed. |
| **Delete** wall/rail | Same repack — no merge step. One Voronoi partition per `canStep`(+hop) component inside hull; no extra centroids; no stale edges. |
| **Update** boundary | Same hull semantics for any touched topology. |

“Passably connected” applies only at the **hull boundary** — which exterior region links to which new interior region across a real `canStep`/hop crossing. Inside the hull, connectivity is whatever flood fill produces.

**Work**

- Make localized hull repack the default in `rebuildDamagedArea` (every topology edit), not only large voxel opens.
- Cut: collect open cells from regions touching hull → remove those region nodes → clear `cellToNode` in hull.
- Rebuild: `_createRegionFromCells` per walk component (same math as init: distance-to-wall seeding, `maxCellsPerChunk`, `canStep`).
- Stitch: reconnect hull regions to unchanged exterior; `_validateRegionEdges` / `_regionsSharePassableLink`; prune unreachable from seed.
- Drop or demote incremental split/assign/merge paths that duplicate repack (keep strip-blocked for adds).
- Tests: rail maze erase, single-edge delete — node count, centroids, and edges match walk components.

### 2. Worker-owned abstract graph (~15%)

- `patchRegionGraph` on worker — region assignment + persist CSR patch; main drops per-edit `rebuildDamagedArea` + full `packHpaGraphForWorker`
- Incremental hop CSR (dirty-only; today full O(cells) repack on patch)

### 3. Path correctness polish

- Portal abstract edge cost (centroid Chebyshev today, not hop cost 1)
- Belt transfer edges (portal hop machinery)
- Partial paths: `maxLegs` / `maxCells` on `requestPath`

---

## Worker vs main

| | Worker | Main |
| --- | --- | --- |
| **Replan** | Abstract A*, temp-connect, per-leg local A*, stitch | `requestPath` → await result |
| **Nav octile** | Bakes from SABs; `navView` for A* | `patchNavTopology(dirtyBounds)`; zero-copy views |
| **Path output** | Cell path + abstract idx in slot SABs | `applyHpaReplanResult`; steer from `hpaPathSlot.js` |
| **Abstract graph** | CSR persist; A* at replan (target) | `nodesMap`; `rebuildDamagedArea` today (→ worker patch) |
| **Portal traverse** | — | Crossing grant, hop mouth on path follow |

**Click:** `requestPath` → nav/graph sync if stale → worker replan + stitch → main apply.

**Edit (today):** `rebuildDamagedArea` + `patchNavTopology` → worker octile patch → `syncAbstractGraph`.

---

## Done

- Worker-owned stitch; main never stitches on replan hot path
- `HpaPathWorker.requestPath` + SAB path-follow
- Zero-copy nav views; no octile mirror-back
- Incremental `patchNavTopology`; full sync only on init / resize / no bounds
- Cost-only abstract edges; worker local A* at stitch
- Portal hop mouth clamp on path follow
- Region repack on large carve only (→ default hull repack is next); subdivide oversized in dirty hull
- Edit-time `canStep` on split/reconnect/prune; edge validation against real crossings
- Editor eraser (`gen:erase`) for carve testing

---

## Rules

- **No main-thread fallbacks** on click/replan — no main A*, stitch, or sync octile bake for convenience; stale epoch → await worker, don’t plan locally
- One `patchNavTopology` entry; no scattered full-grid repacks
- No in-memory migration shims — refresh is the migration
- Extend `Libraries/Pathfinding/` — no parallel worker copies
- Scene list must not enumerate bulk terrain voxels; no dual nav bake pipelines
