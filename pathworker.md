# Path worker

**~75%** — HPA click-to-move on big maps.

## North star — main owns sim intent, worker owns nav truth

One rule, two pipes:

| | Main | Worker |
| --- | ---- | ------ |
| **Sim** | Write `obstacleGrid` / `edgeStore` / floors (walls, rails, portals, carves) | — |
| **Nav infra** | — | Derive walkability + regions + abstract CSR; keep correct |
| **Replan** | Request path (start, target, epoch); apply waypoints; steer | Plan + stitch → return cell path |
| **After edit** | Dirty bounds + epoch bump | Patch affected nav infra in expanded hull |

**Paths:** main requests a path, worker returns it.

**Edits:** main applies the world change, then says **where** sim state was touched. Worker reads that area and corrects navigation. Main does not repack regions, merge chunks, reconnect abstract edges, or upload the full graph.

---

## What main says vs what worker figures out

Main speaks **sim**, not **nav**. The player removes a rail; main clears the boundary slot and notifies a bounds rect. Main does **not** send “this edge is no longer closed” or “merge these regions” — that is the worker’s job after reading current sim.

| Layer | Main (authoritative write) | Worker (derived read + fix) |
| ----- | -------------------------- | --------------------------- |
| **You think** | “Removed this rail / carved this voxel” | — |
| **Main writes** | `grid[]`, `edgeStore`, boundary occupancy, floors | — |
| **Main notifies** | `damageBounds` around the edit + `obstacleGeneration` epoch | — |
| **Worker reads** | — | Sim in hull (today: packed nav SAB slices; target: derive from sim) |
| **Worker infers** | — | “This crossing is open now”, “these cells are one walk component”, region partition, abstract edges |
| **Worker patches** | — | Octile SABs + region CSR in hull |

So it is **not** “hey we removed this rail” as the worker API message. It is **“sim was updated here; reconcile nav.”** The rail removal is already in sim when the notify fires. Worker infers open crossings from current sim / walk state — today via packed nav views; target by deriving in hull from sim directly.

**Dirty bounds** = minimal AABB of what main changed (one cell, edge neighborhood, erase rect). Worker expands hull (`damagePadding`, nav margin) — main does not need to know infection radius long term; tight edit rect is enough.

Main never needs Voronoi seeds, centroids, chunk merge, or abstract edge lists. Only: **sim write**, **where**, **epoch**.

Paths are mostly on this model (`requestPath` → worker). Edits are not — main still runs `rebuildDamagedArea` and `syncAbstractGraph` after every change.

---

## Today vs target

| | Today | Target |
| --- | ----- | ------ |
| **Edit** | Main hull-repacks `nodesMap` → `patchNavTopology` → full `syncAbstractGraph` | Main: sim write + `notifySimDirty(bounds, epoch)` → Worker: `patchNavTopology` + `patchRegionGraph` |
| **Replan** | Main reads `cellToNode` for local vs HPA; awaits worker | Main: `requestPath` only; worker decides mode + plans |
| **Debug** | `labMapCaches` reads main `nodesMap` | Read-only mirror from worker meta (or dev-only) |

Main-thread hull repack (`_repackHullRegions` + `mergeSmallRegions`) is **correct** — validated on cavern add/delete. Worker migration reuses that contract; it does not re-invent it.

---

## Memory model — today, target, simplify

### Today (more copies than it looks)

`obstacleGrid` is **not** a SharedArrayBuffer shared with the HPA worker. Main sim lives on the heap; worker gets **derived copies** in its own SABs.

| Data | Where today | SAB? |
| ---- | ----------- | ---- |
| Voxel fill | `obstacleGrid.grid` (main) | No |
| Rails / portals / forcefields | `edgeStore` — sparse slots + pool (main) | No — not a dense “rail grid” |
| Walk caches | `vertexPassability`, `navCardinalOpen` (main, rebuilt on edit) | No |
| Worker nav (blocked, octile, hops) | `HpaPathWorker` `sabBlocked`, `sabOctileNeighbors`, … | Yes — worker-owned; main **packs** slices on patch |
| Region graph | `nodesMap` / `cellToNode` (main JS) | No |
| Worker abstract CSR | `sabPersistGraph*` | Yes — worker-owned; main **full-uploads** on each edit |
| Flow field obstacles | separate `sabObstacle` | Yes — third blocked copy |

Rails affect nav as: **edgeStore → passability bake on main → copy into worker nav SABs**. Worker never reads `edgeStore` directly.

```text
Today (simplified)

Main heap                         Worker SAB
──────────                        ──────────
grid[], edgeStore, floors    →    sabBlocked[], sabCardinalOpen[],
  syncGridTopologyCaches          sabVertexPassability[], octile, hops
                                  (pack / patch per edit)

nodesMap (JS)                →    sabPersistGraph* (CSR)
                                  (full syncAbstractGraph per edit)

                                  sabObstacle (flow — another copy)
```

### Target (two worker domains, one main job)

```text
Main: sim write + notifySimDirty(bounds, epoch)

Worker (one job per notify):
  read sim in expanded hull
  → patch nav SABs (passability, octile, hops)
  → patch region CSR (hull repack + merge)
```

Main does not keep parallel nav caches or `nodesMap` for HPA. Two worker SAB domains — **nav** and **graph** — not five parallel models.

### Simplification path

| Step | What collapses | When |
| ---- | -------------- | ---- |
| **PR1–2** | Drop dual graph authority (`nodesMap` + full graph upload) | Worker owns persist CSR |
| **After PR2** | Worker derives passability/octile in hull; stop copying from main `navCardinalOpen` / `vertexPassability` for HPA | One sim→nav pipe on worker |
| **Later** | Flow field reads shared blocked view; drop third `sabObstacle` copy | After nav SAB is canonical |
| **Optional** | Flat shared sim SAB (voxels + boundary encoding); worker reads directly, no pack step | Bigger migration; `edgeStore` can stay sparse on main for editor |

**Do not simplify away:** dirty bounds, epoch, sparse `edgeStore` for editing. **Do simplify away:** main-side region graph, main-side nav cache + pack/upload, full `syncAbstractGraph` every edit.

---

## 3 PR plan

### PR1 — Worker `patchRegionGraph` (hull contract on worker)

- Port hull cut + rebuild + `mergeSmallRegions` to worker persist CSR (`HpaWorkerEntry` handler + shared `Libraries/Pathfinding/` modules).
- Add worker message; call from `onObstaclesChanged` after sim write (dual-run: main still repacks for debug until PR2).
- Dev assert or test: worker CSR matches main `nodesMap` after edit in dirty hull.

### PR2 — Slim main edit path (worker authoritative)

- Replace main edit stack with: sim write → `notifySimDirty(bounds, epoch)` → worker patches nav + regions.
- Remove `rebuildDamagedArea` + `syncAbstractGraph` from `onObstaclesChanged` hot path.
- Debug overlay reads worker graph meta (or thin mirror); main drops `nodesMap` ownership on edit.
- Begin moving passability/octile derivation into worker patch (stop relying on main→worker cache copy for HPA).

### PR3 — Replan cleanup + regression tests

- Move local-vs-HPA prep off main `cellToNode` into worker replan (main sends endpoints + epoch only).
- Automated tests: rail maze single-delete, cavern add/delete cycle — graph and paths match fresh load.
- Delete dead main fallback paths (main abstract A*, stitch) where worker path is unconditional.

---

## Later (not blocking worker migration)

- Worker derives nav from sim in hull (full collapse of main nav cache + pack path)
- Shared sim SAB (optional) — zero-copy sim read on worker; sparse `edgeStore` can remain on main for editor
- Consolidate flow-field blocked with worker nav blocked
- Portal abstract edge cost (centroid Chebyshev today, not hop distance)
- Belt transfer edges
- Partial paths: `maxLegs` / `maxCells` on `requestPath`

---

## Rules

- **Main requests path; worker returns it.**
- **Main writes sim and notifies where; worker reads sim and corrects nav** — one notify per edit, not scattered rebuild entry points.
- Notify is bounds + epoch, not nav vocabulary (no region merge / edge-open messages on the wire).
- Stale epoch → await worker; no local fallbacks for convenience.
- One `patchNavTopology` entry; one `patchRegionGraph` entry — worker may batch both per notify.
- No in-memory migration shims — refresh is the migration.
- Extend `Libraries/Pathfinding/` on worker — no parallel graph copies.
- Scene list must not enumerate bulk terrain; debug bake is not a second nav pipeline.
