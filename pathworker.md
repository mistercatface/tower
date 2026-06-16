# Path worker

**~70%** — HPA click-to-move on big maps. **Main requests a path; worker plans and stitches it.** Main applies waypoints and steers — no A\*, stitch, or graph surgery on the click hot path.

The click/replan pipe is largely wired. What blocks “done” is **abstract graph integrity after edits** — incremental split/assign/reconnect leaves wrong region nodes, adjacent duplicate centroids, and edges that don’t match real `canStep` connectivity. The fix is **hull cut + rebuild** (recompute assignment in the dirty patch), not merge heuristics on stale state.

---

## Priorities (in order)

### 1. Graph CRUD — predictable edit semantics (~40%)

`HierarchicalNavigator.rebuildDamagedArea` must behave like a real CRUD layer: edit → graph matches navigable topology, no residue.

**Broken today**

- ~~Incremental surgery / repack threshold gate~~ — fixed: `rebuildDamagedArea` is hull cut + rebuild only.
- **Worker still full-syncs** abstract graph after each edit; `patchRegionGraph` not landed.
- **No automated tests** for rail maze erase / single-edge delete vs walk components.
- **Distant latent bugs** — regions never touched by any edit hull keep prior state until an edit reaches them.

**Target contract — hull cut + rebuild**

Define a **dirty hull** (edit bounds + `damagePadding` + nav topology margin). Inside the hull, region assignment is **recomputed from current walk topology**, not patched.

**Mutation trigger:** `onObstaclesChanged(damageBounds)` means nav topology may have changed — always hull-repack. Do **not** gate on `openedCellCount` or voxel opens; rail deletes change `canStep` with `grid` unchanged.

**Post-rebuild invariants (fail loud in dev):** every region is one `canStep`(+hop) component; every assigned floor cell appears in its region’s `cells`; every abstract edge passes `_regionsSharePassableLink`.

| Operation | Expectation |
| --------- | ----------- |
| **Add** wall/rail | Strip blocked cells; repack open cells in hull; reconnect boundary to exterior; prune unreachable from seed. |
| **Delete** wall/rail | Same repack — no merge step. One Voronoi partition per `canStep`(+hop) component inside hull; no extra centroids; no stale edges. |
| **Update** boundary | Same hull semantics for any touched topology. |

“Passably connected” applies only at the **hull boundary** — which exterior region links to which new interior region across a real `canStep`/hop crossing. Inside the hull, connectivity is whatever flood fill produces.

**Work**

- Cut: regions touching hull + unassigned open floor in hull → remove nodes → `_createRegionFromCells`.
- Rebuild: per walk component (distance-to-wall seeding, `maxCellsPerChunk`, `canStep`).
- Stitch: `_reconnectRegionEdges` on repacked ids; `_validateRegionEdges`; `_assertRegionGraphIntegrity`; prune unreachable from seed.
- Worker `patchRegionGraph` reuses same hull contract (main implementation lands first).
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
- Hull repack default on every topology edit (`_repackHullRegions`); incremental split/assign/subdivide removed
- Edit-time `canStep` on split/reconnect/prune; edge validation against real crossings
- Editor eraser (`gen:erase`) for carve testing

---

## Rules

- **No main-thread fallbacks** on click/replan — no main A*, stitch, or sync octile bake for convenience; stale epoch → await worker, don’t plan locally
- One `patchNavTopology` entry; no scattered full-grid repacks
- No in-memory migration shims — refresh is the migration
- Extend `Libraries/Pathfinding/` — no parallel worker copies
- Scene list must not enumerate bulk terrain voxels; no dual nav bake pipelines
