# Procedural & tile worker — 8-pass plan

Roadmap for **tile bake performance**, **seeded fields infrastructure** (Perlin + cellular/Worley), and **level-generation unlocks** from `Plans/Procedural.md`.

## Current state (shipped)

**Tile worker stack** — done: pool → scheduler/client → `TileSurfaceWorker` → `WorldSurfacePainter`. No more boundary OOP.

**Bake perf phase 1** — done: `BakeSession` on the worker, pixel-outer `composeSurfaceImage`, per-pixel noise memo (8 slots), `permCaches` by seed, static/animated motif split for horizontal patches, pooled sample arrays.

**Pass 1 instrumentation** — done, **off by default**: phase timing (`sampleFill`, `composeStatic`, `composeFrame`, `rgbaCopy`, `transfer`), noise calls/px + hit/overflow rates, rolling averages on `TileBakeScheduler.stats().bakeTiming`. When disabled, the hot path skips `performance.now()`, noise profile counters, worker console logs, and metrics on `postMessage` — same shape as pre-instrumentation bakes.

**Enable for profiling:**

```javascript
TileWorkerCoordinator.enableTileBakeMetrics(true);
// or TileSurfaceWorkerClient.enableTileBakeMetrics(true)
```

Worker logs resume; main-thread `stats().bakeTiming` accumulates over the last 32 jobs.

**Pass 1 findings (ground chunks, 16,384 px):** `composeStatic` dominates (~7–11 ms, ~98% of bake). `sampleFill`, `rgbaCopy`, and `transfer` are negligible. Noise runs **5–6 calls/px** with **0% memo hits** (distinct coords per call, not duplicate work) and **0% overflows** (8 slots sufficient). Next wins are **fewer noise evaluations per pixel** (Pass 3), not memo widening or worker/scheduler work.

**Pass 2 — `SeededNoise2D`** — done: module-global `activeNoiseMemo` / `noise2D` removed. `BakeSession` owns `memoryPool + noiseEvaluator`. `composeSurfaceImage`, `DomainWarp`, and all motifs sample via `sample.noise.sample2D`. `static fromDerived(rootSeed, salt)` ready for Tier 10 sub-seeds.

**Pass 3 — compose phase 2** — done: skip domain-warp noise when the active stack has no warped motifs (or warp amplitude is 0 — eval copy only); horizontal-patch frame RGB pooled on `BakeSession.memoryPool`. Post-filter split removed — zero noise savings, added hot-path overhead.

**Pass 4 — Fields foundation** — done: `SeededFeatureHash` owns deterministic cell jitter + salted seed derivation; `VoronoiEdge` imports the shared hash and exposes `WorleyEdgeField`; focused parity tests cover hash determinism and unchanged edge metrics.

**Post-Pass-4 profiling note:** latest worker profile still points at `composeSurfaceImage`, `SeededNoise2D.sample2D` / `rawNoise2D`, `blendMotifRgb`, `deckPlates.applyRivets`, `filterHSV.rgbToHsv`, and `baseMetal.apply`. `VoronoiEdge`, `WorleyEdgeField`, and `SeededFeatureHash` do not show up as hot frames, so Pass 4 should be treated as infrastructure progress, not a bake-time regression source. Keep the SoA/compiler idea parked until Fields/root-seed work is complete and metrics still justify it.

**Naming trap:** `Plans/Procedural.md` = geometry authorship. `Libraries/Procedural/` = surface synthesis. Shared **Fields** layer is the bridge.

**Voronoi:** `VoronoiRegions.js` (HPA grid partition) ≠ `VoronoiEdge.js` (Worley texture noise). Share **seeded spatial hash** primitives only, not partition algorithms.

---

## Pass 4 — Fields foundation

Done. Stay the course here before any motif-runtime rewrite. The implemented state is:

- `SeededNoise2D` is session-owned and profileable.
- `SurfaceTextureComposer` is already pixel-outer and uses pooled sample/RGB arrays.
- `SeededFeatureHash.js` owns deterministic cell hash/jitter.
- `VoronoiEdge.js` imports the shared hash and exposes `WorleyEdgeField`.
- `generateVoronoiRegions` is still its own HPA partition path and should not be merged with Worley.

Exit: one seeded spatial hash implementation, no duplicated jitter blocks, and a Fields layer that texture bakes and generation code can both consume.

## Pass 5 — Pathfinding + Fields

Keep `generateVoronoiRegions` as the HPA partition algorithm. Do not route HPA through Worley and do not change region topology for this pass.

Next steps:

1. Add a small `GridSiteField` helper beside the other Fields modules. It should use `SeededFeatureHash` for deterministic per-cell jitter/ranking and expose generation-friendly site sampling; it should not know about HPA internals.
2. Import the shared hash or `GridSiteField` only where HPA/generation needs deterministic site ordering or placement jitter.
3. Keep `generateVoronoiRegions` behavior stable. Do not replace distance-transform ordering, flood fill, centroid repositioning, or adjacency discovery with Worley logic.
4. Add targeted tests for `GridSiteField` determinism and, only if HPA imports it, a narrow parity check proving region topology is unchanged for the existing fixture.

Exit: nav tests unchanged, documented hook for shared primitives, and a deterministic grid-site field ready for Tier 7 placement.

## Pass 6 — Unified root seed

`ProceduralSeed` → derived seeds for cavern, graph, corridors, tile bakes, nav, biomes. Wire chunk/atlas seeds through one table.

Next steps:

1. Define the root-seed module and salt names once.
2. Replace ad hoc `worldSurfaceSeed ?? 0` handoffs with derived seeds at bake payload boundaries.
3. Document the sub-seed map in this plan or `Plans/Procedural.md`.
4. Add one integration test that proves a root seed deterministically reaches a tile bake and one generation field.

Exit: documented sub-seed map + one integration test.

## Pass 7 — Generation consumption

Biome field → profile assignment; room-graph generator v1 (rect pack + MST); optional noise carver; `GridSiteField` placement. Exit: root seed → generated layout → existing bake → textured tiles.

## Pass 8 — Golden tests + doc sync

Tile RGB checksums; noise/Fields unit goldens; nav region golden; room-graph v1 golden. Update `Plans/Procedural.md` fundamentals. Optional CI budget thresholds using the metrics hook.

---

## Parked — Motif runtime SoA/compiler spike

Do **not** pivot the main plan to a whole motif SoA rewrite yet. The current hot path already stores sample coordinates and RGB in typed arrays; the remaining cost is mostly heterogeneous motif execution and noise/field evaluation inside `composeStatic`.

Revisit only after Pass 4–6 are stable and metrics still show `composeStatic` as the limiting cost. If revisited, start with a narrow compiled-kernel spike for one common stack (`baseMetal` + one structural motif + one filter), hoisting config/default/blend decisions out of the pixel loop. Promote it only if the metrics beat the current composer without visual checksum drift.

---

## Skip

| Item                               | Why                     |
| ---------------------------------- | ----------------------- |
| Coordinator shim removal           | Hygiene, zero bake time |
| Merging Voronoi partition + Worley | Different algorithms    |
| Lowering `surfaceBakeScale`        | Changes look            |
| More worker-boundary OOP           | Stack is settled        |
| Whole-system motif SoA pivot       | Measure after Fields/root-seed work |

---

## File map

```text
Libraries/WorldSurface/TileBakeMetrics.js   — opt-in metrics (default off)
Render/WorldSurface/TileSurfaceWorker.js    — worker entry, metrics gate
Libraries/WorldSurface/WorldSurfacePainter.js — BakeSession, phase timing when enabled
Libraries/Procedural/Noise/SeededNoise2D.js — session-scoped noise + permCaches + per-pixel memo
Libraries/Procedural/SurfaceTextureComposer.js — pixel-outer compose
Libraries/Procedural/Fields/SeededFeatureHash.js — shared seeded spatial hash
Libraries/Procedural/Fields/VoronoiEdge.js  — Worley edge + WorleyEdgeField
Libraries/Procedural/Fields/GridSiteField.js — deterministic grid placement/order field (Pass 5)
Libraries/Pathfinding/VoronoiRegions.js     — HPA partition (Pass 5 hooks only)
Plans/Procedural.md                         — geometry tree (sync Pass 8)
Plans/TileWorkerPlan.md                     — worker OOP refactor (done)
```
