# Path worker

**~70%** — HPA click-to-move on big maps. **Main requests a path; worker plans and stitches it.** Main applies waypoints and steers — no A\*, stitch, or graph surgery on the click hot path.

The click/replan pipe is largely wired. What blocks “done” is **abstract graph integrity after edits** — today add/delete/update leave wrong region nodes, adjacent duplicate centroids, and edges that don’t match real `canStep` connectivity. Paths on a freshly loaded map are more trustworthy than paths after carving rails/voxels.

---

## Priorities (in order)

### 1. Graph CRUD — predictable edit semantics (~40%)

`HierarchicalNavigator.rebuildDamagedArea` must behave like a real CRUD layer: edit → graph matches navigable topology, no residue.

**Broken today**

- **Delete / open connectivity** — removing a rail or voxel can join two floor cells but **never merges** their regions (`mergeSmallRegions` runs only on full init).
- **Split without merge** — every edit re-splits regions in the damage patch; disconnected components peel into new adjacent centroids; opened corridors still show paired blue nodes.
- **Assign orphans** — `_assignOpenedCells` only merges into neighbors when `canStep` reaches them during flood; otherwise it mints a 1-cell region next to an existing one.
- **Historical residue** — regions can still span `canStep`-disconnected cells until split runs; centroids sit in pockets while edges route through other cells in the same region.

**Target contract**

| Operation | Expectation |
| --------- | ----------- |
| **Add** wall/rail | Split or repack in dirty hull; no new abstract edge unless a real crossing exists; unreachable pockets pruned from seed. |
| **Delete** wall/rail | Merge passably connected regions in hull; no extra centroids; no stale edges to removed components. |
| **Update** boundary | Same as add/delete for touched topology; incremental `mergeSmallRegions` (or localized repack), not init-only. |

**Work**

- Merge when `canStep` opens between existing regions (mirror `mergeSmallRegions` on incremental path).
- Run `mergeSmallRegions` (or equivalent) after reconnect in `rebuildDamagedArea`.
- Localized repack in dirty hull on topology-only edits (rails), not only large voxel carves.
- Edge validation stays (`_regionsSharePassableLink`); extend tests around rail maze erase / single-edge delete.

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
- Region repack on large carve; subdivide oversized regions in dirty hull
- Edit-time `canStep` on split/reconnect/prune; edge validation against real crossings
- Editor eraser (`gen:erase`) for carve testing

---

## Rules

- **No main-thread fallbacks** on click/replan — no main A*, stitch, or sync octile bake for convenience; stale epoch → await worker, don’t plan locally
- One `patchNavTopology` entry; no scattered full-grid repacks
- No in-memory migration shims — refresh is the migration
- Extend `Libraries/Pathfinding/` — no parallel worker copies
- Scene list must not enumerate bulk terrain voxels; no dual nav bake pipelines
