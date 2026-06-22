# Procedural & tile worker — 8-pass plan

Unified roadmap for **tile bake performance**, **seeded fields infrastructure** (Perlin + cellular/Worley), and **level-generation unlocks** from `Plans/Procedural.md`. The tile worker stack (pool → scheduler/client → `TileSurfaceWorker` → `WorldSurfacePainter`) is **done** — no more boundary OOP. Phase 1 perf is **shipped**: `BakeSession` on the worker, pixel-outer `composeSurfaceImage`, per-pixel noise memo, `permCaches` by seed, static/animated motif split for horizontal patches, and `[TileWorker]` compose vs transfer logs.

This plan is the **next eight passes**, in order. Each pass is one paragraph: goal, scope, exit criteria, and what it unlocks. Passes are bit-identical for bakes unless a pass explicitly says otherwise. `surfaceBakeScale` stays off the table for perf work.

**Naming trap (keep straight):** `Plans/Procedural.md` owns **geometry authorship** (CA, room graph, bake, placement). `Libraries/Procedural/` today is mostly **surface synthesis** (motifs, noise). This plan builds a **shared Fields layer** both sides consume — without conflating nav region partitioning with texture Voronoi cells.

**Voronoi honesty:** Pathfinding’s `VoronoiRegions.js` is **not** the same algorithm as `VoronoiEdge.js`. Nav uses distance-transform + greedy flood-fill partition into `RegionNode` graphs (connectivity-aware, grid-native). Textures use **Worley/cellular noise** (hash-jittered feature points, continuous edge metric). You cannot merge those into one function without changing behavior. What _is_ shared: **seeded spatial hashing** (`hashCell`), future **feature-point fields**, and the **session-scoped evaluator** pattern. Pathfinding keeps its partition logic; it can later _seed_ or _score_ region sites using the same hash primitives the texture path uses — not duplicate them inline.

---

## Pass 1 — Measure what still costs (tile delivery baseline)

Before more optimization, split the opaque `[TileWorker] Compose` number into **sample-fill**, **compose-static**, **compose-frame**, **rgba-copy**, and **transferToImageBitmap** inside `paintPixelArea`, `bakeHorizontalPatchCanvases`, and `TileSurfaceWorker.onMessage`. Add optional rolling averages alongside `TileBakeScheduler.stats()` (queue depth is not bake milliseconds). Profile **one representative ground chunk** and **one worst-case animated horizontal patch** with the heaviest motif stack in `Config/procedural/`. Count **noise calls per pixel** and **memo miss rate** (how often the 8-slot scratch overflows). Exit when you can answer, for each job type, which phase dominates and whether the next hour belongs in noise, compose, or scheduler dedupe. Do not change output. This pass only buys a dashboard so Passes 2–4 prove themselves.

---

## Pass 2 — `SeededNoise2D`: session-scoped noise (the OOP move that pays)

Replace module-global `activeNoiseMemo`, `currentNoiseSeed`, and free-function `noise2D` imports with a **`SeededNoise2D` class** in `Libraries/Procedural/Noise/`: holds seed, pointer into shared `permCaches`, per-pixel memo arrays, `sample2D(x, y, octaves)`, `beginPixel()` / `endPixel()`, and `static fromDerived(rootSeed, salt)` for sub-seeds. **`BakeSession`** owns one instance (`memoryPool + noiseEvaluator`) instead of `createNoiseMemo` + `setActiveNoiseMemo`. Wire through `composeSurfaceImage`, `DomainWarp`, and motifs via `sampleScratch.noise` (or equivalent) — motifs stop importing globals. Keep a thin `noise2D()` wrapper temporarily if migration needs it, but new code uses the class. Exit: all tile worker bakes pass existing visual/regression checks; no global memo side effects; `ensureNoiseInitialized` logic lives on the instance. This is the structural move that serves **tile perf** and **`Procedural.md` Tier 10** (derived sub-seeds) at once — not coordinator/handler OOP.

---

## Pass 3 — Tile compose phase 2 (fewer evaluations, same pixels)

With the evaluator in place, attack redundant work bit-identically. **Motif audit:** fix literal duplicate `sample2D` calls per pixel (e.g. `baseMetal` structure + grain, warp at zero amplitude). **Memo:** widen capacity to worst-profile unique tuple count, or key by quantized fixed-point `(x, y, octaves)`. **Compose fusion:** when `warp.amplitude === 0`, assign `lookupX[i] = evalX[i]` inline in the base fill — skip `writeDomainWarp`. **Motif classification at build time:** tag passes as eval-only, warped-lookup, or HSV-post; skip translate/warp paths pixels do not need. **HSV:** where stack order allows, one buffer sweep instead of per-layer `rgbToHsv`. **Horizontal patches:** pool frame RGB scratch on `BakeSession` instead of `new Float32Array(staticBuffer)` per frame. Exit: Pass 1 metrics show compose-static and compose-frame down on the profiled jobs; zero visual drift on golden chunk + patch frames.

---

## Pass 4 — Fields foundation: shared seeded spatial primitives

Introduce `Libraries/Procedural/Fields/` (or `Libraries/Fields/` if you want pathfinding imports without a “texture” smell) as the **cross-cutting primitive layer** — not a barrel catalog, direct imports only. **Extract `hashCell` / feature-point jitter** from `VoronoiEdge.js` into something like `SeededFeatureHash.js` (same math, one implementation). Add **`WorleyEdgeField`** (today’s `voronoiEdgeMetric`) as a class or namespace that takes `(worldX, worldY, density, seed)` and uses the shared hash. Document the contract: **continuous scalar/vector fields** sampled in world space; deterministic from integer seed + salt. Perlin (`SeededNoise2D`) and Worley live side by side with the same `fromDerived` story. Exit: `voronoiCell` motif and `VoronoiEdge.js` call shared hash code; no duplicated `Math.imul` shuffle blocks elsewhere. Pathfinding does not change behavior yet.

---

## Pass 5 — Pathfinding + Fields: shared seeds, separate partition (Voronoi unification scope)

**Do not** replace `generateVoronoiRegions` with Worley noise — nav regions must respect `canStep`, chunk sizes, merge rules, and damage repack. **Do** remove redundant _hashing_ and prepare **optional** convergence: (1) move `RegionNode` partition helpers to stay in `Libraries/Pathfinding/` but import **`SeededFeatureHash`** if any inline jitter/hash appears in region seeding; (2) add a **`GridSiteField`** helper that proposes candidate sites on a grid using the same feature hash (blue-noise-ish spacing) — usable later for HPA seed ordering _or_ open-cell placement (`Procedural.md` Tier 7 Poisson direction) without copy-pasting hash code; (3) if region seed order ever moves off pure distance-transform sort, derive sort keys from `fromDerived(navSeed, "hpa-regions")` through the shared field API. Exit: pathfinding tests (`hpa`, corridor, region rebuild) unchanged; zero duplicate hash implementations; a documented hook showing how nav _could_ consume `GridSiteField` in a follow-up without forking Perlin/Worley. Texture and nav share **primitives**, not **partition algorithms**.

---

## Pass 6 — Unified root seed + evaluator factory (`Procedural.md` Tier 10)

Implement **`ProceduralSeed`** (or extend `SeededRng`) as the single entry: one root integer → derived seeds for cavern CA, room-graph generator, corridor links, tile chunk bakes, nav region build, and biome fields via `SeededNoise2D.fromDerived(root, "texture")`, `fromDerived(root, "cavern")`, etc. Wire tile worker chunk `seed` and wall atlas seeds through the same derivation table so consecutive jobs with the same logical world seed hit **`permCaches`** and field evaluators predictably. Replace bare `Math.random` in gen paths called out in `Procedural.md` (new links, rerolls) with scoped derived RNG. Exit: given root `N`, document the sub-seed map; one integration test proves cavern + texture evaluator + Worley field all derive deterministically from `N`. Tile worker and main thread both use the factory — no ad-hoc offsets.

---

## Pass 7 — Generation consumption: biomes, layout prep, optional noise carver

With evaluators and unified seeds, unlock **`Procedural.md` authorship** without rebuilding the bake pipeline. **Tier 8:** prototype **biome field** — sample `(worldX, worldY) → profileId` via low-frequency `SeededNoise2D` (or 2D Worley regions for sharp biome borders); assign at room-graph or cell level using existing `roomGraphSurfaceProfile.js` resolution. **Tier 11 rung 1 prep:** room-graph generator v1 (rect pack + MST) outputs the same `RoomNode`/`RoomLink` structures the editor uses; geometry still comes from existing Tier 3–5 bake. **Tier 1 optional:** noise threshold carver alongside CA (same grid stamp pipeline, different fill rule) using grid-aligned noise samples from a derived evaluator — only after Fields API is stable. **Tier 7:** Poisson/min-distance placement using `GridSiteField` from Pass 5 instead of uniform `pickOpenCavernCell` only. Exit: at least one end-to-end demo path (root seed → generated graph or biome map → existing bake → textured tiles) without manual room placement; tile worker reads profiles assigned by field, not hand-authored per-node only.

---

## Pass 8 — Golden tests, regression gates, and doc sync

Lock determinism before scaling generators. **Tile:** golden RGB hashes (or checksum) for one ground chunk + one horizontal patch frame per flagship profile (`toxicSludge`, metal, etc.) at fixed seed and bake constants. **Noise/Fields:** unit tests for `SeededNoise2D` and `WorleyEdgeField` sample values at known coordinates; memo must not change results. **Nav:** seed golden for `generateVoronoiRegions` on a small grid fixture (new coverage for `Procedural.md` Tier 12 CA/region gaps). **Gen:** once Pass 7 lands, seed golden for room-graph generator v1 output graph JSON. Update **`Plans/Procedural.md`** fundamentals: split `[~] Perlin/Voronoi` into `[x] seeded field evaluators (texture + shared hash)` and `[~] nav region partition (grid Voronoi)`; add Fields layer cross-ref. Retire this plan’s Pass 1 console-only timing in favor of optional CI budget thresholds. Exit: regressions catch memo, perm, or hash drift; team can land Pass 2–7 changes with confidence.

---

## What to skip (explicitly)

| Item                                                | Why                                               |
| --------------------------------------------------- | ------------------------------------------------- |
| Removing `TileWorkerCoordinator` shim               | Hygiene, zero bake time                           |
| Thinner `TileSurfaceWorker` handlers                | Fine as dispatch surface                          |
| Merging `VoronoiRegions` + `VoronoiEdge` algorithms | Different problems; shared hash only              |
| Lowering `surfaceBakeScale` for perf                | Changes look                                      |
| Full WFC / BSP before room-graph v1                 | `Procedural.md` keystone is MST + rect pack first |
| More worker-boundary OOP                            | Stack shape is settled                            |

---

## Pass dependency sketch

```text
Pass 1 (measure)
  └─► Pass 2 (SeededNoise2D + BakeSession)
        └─► Pass 3 (compose phase 2 perf)
        └─► Pass 4 (Fields foundation / shared hash)
              └─► Pass 5 (pathfinding hooks, no partition merge)
Pass 6 (unified seed) ── can start after Pass 2; fully pairs with Pass 4–5
  └─► Pass 7 (biomes, generator v1, placement)
        └─► Pass 8 (goldens + doc sync)
```

---

## Current file map (starting points)

```text
Render/WorldSurface/TileSurfaceWorker.js     — worker entry, BakeSession, timing logs
Libraries/WorldSurface/WorldSurfacePainter.js — BakeSession, pool, patch static/frame split
Libraries/Procedural/SurfaceTextureComposer.js — pixel-outer compose
Libraries/Procedural/Noise/Perlin2D.js       — permCaches, memo (→ Pass 2 class)
Libraries/Procedural/Fields/VoronoiEdge.js   — Worley edge metric (→ Pass 4 shared hash)
Libraries/Pathfinding/VoronoiRegions.js      — HPA grid partition (keep; Pass 5 hooks only)
Libraries/Pathfinding/hpaRegionGraph.js      — buildFullRegionGraph consumer
Plans/Procedural.md                          — geometry authorship tree (sync at Pass 8)
Plans/TileWorkerPlan.md                      — OOP refactor status (done)
```

_Last updated: consolidated from tile worker perf Phase 1–2 notes, Fields/OOP noise alignment with `Procedural.md`, and Voronoi pathfinding vs texture unification scope._
