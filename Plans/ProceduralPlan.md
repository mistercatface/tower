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

**Pass 2 — `SeededNoise2D`** — done: module-global `activeNoiseMemo` / `noise2D` removed. `BakeSession` owns `memoryPool + noiseEvaluator`. `composeSurfaceImage`, `DomainWarp`, and all motifs sample via `sample.noise.sample2D`. `Perlin2D.js` re-exports `SeededNoise2D` + `setNoiseProfileEnabled` only. `static fromDerived(rootSeed, salt)` ready for Tier 10 sub-seeds.

**Naming trap:** `Plans/Procedural.md` = geometry authorship. `Libraries/Procedural/` = surface synthesis. Shared **Fields** layer is the bridge.

**Voronoi:** `VoronoiRegions.js` (HPA grid partition) ≠ `VoronoiEdge.js` (Worley texture noise). Share **seeded spatial hash** primitives only, not partition algorithms.

---

## Pass 3 — Compose phase 2 (fewer evaluations)

Motif audit for duplicate samples per pixel; zero-amplitude warp inline (`lookup = eval`); motif classification (eval / warped / HSV-post); defer HSV where stack order allows; pool horizontal-patch frame RGB on `BakeSession`. Do not touch `surfaceBakeScale`. Exit: lower `composeStatic` on profiled ground chunks with zero visual drift. Re-enable metrics to verify.

## Pass 4 — Fields foundation

Extract `hashCell` from `VoronoiEdge.js` into `SeededFeatureHash.js`; wrap `WorleyEdgeField`; sit beside `SeededNoise2D` under one seed+salt contract. Exit: one hash implementation, no duplicated jitter blocks.

## Pass 5 — Pathfinding + Fields

Keep `generateVoronoiRegions`; import shared hash; add optional `GridSiteField` for HPA seed ordering and Tier 7 placement. Exit: nav tests unchanged, documented hook for shared primitives.

## Pass 6 — Unified root seed

`ProceduralSeed` → derived seeds for cavern, graph, corridors, tile bakes, nav, biomes. Wire chunk/atlas seeds through one table. Exit: documented sub-seed map + one integration test.

## Pass 7 — Generation consumption

Biome field → profile assignment; room-graph generator v1 (rect pack + MST); optional noise carver; `GridSiteField` placement. Exit: root seed → generated layout → existing bake → textured tiles.

## Pass 8 — Golden tests + doc sync

Tile RGB checksums; noise/Fields unit goldens; nav region golden; room-graph v1 golden. Update `Plans/Procedural.md` fundamentals. Optional CI budget thresholds using the metrics hook.

---

## Skip

| Item                               | Why                     |
| ---------------------------------- | ----------------------- |
| Coordinator shim removal           | Hygiene, zero bake time |
| Merging Voronoi partition + Worley | Different algorithms    |
| Lowering `surfaceBakeScale`        | Changes look            |
| More worker-boundary OOP           | Stack is settled        |

---

## File map

```text
Libraries/WorldSurface/TileBakeMetrics.js   — opt-in metrics (default off)
Render/WorldSurface/TileSurfaceWorker.js    — worker entry, metrics gate
Libraries/WorldSurface/WorldSurfacePainter.js — BakeSession, phase timing when enabled
Libraries/Procedural/Noise/SeededNoise2D.js — session-scoped noise + permCaches + per-pixel memo
Libraries/Procedural/Noise/Perlin2D.js      — re-export SeededNoise2D (compat import path)
Libraries/Procedural/SurfaceTextureComposer.js — pixel-outer compose
Libraries/Procedural/Fields/VoronoiEdge.js  — Worley edge (→ Pass 4)
Libraries/Pathfinding/VoronoiRegions.js     — HPA partition (Pass 5 hooks only)
Plans/Procedural.md                         — geometry tree (sync Pass 8)
Plans/TileWorkerPlan.md                     — worker OOP refactor (done)
```
