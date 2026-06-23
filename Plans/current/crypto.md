## Read this first — hygiene law

### Authority docs

| Doc                                                  | Governs for this plan                                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`./stupid.md`](../stupid.md)                        | No getter/resolver theater; no fake “load” or mini-services; static config = import at use site; no threading catalogs through constructors; **delete > add** |
| [`./passthrough.md`](../passthrough.md)              | No forwarding layers; no parallel bags; no `{ buildX }` that only passes args through; Tier 1b reach passthrough **must not come back**                       |
| [`./normalization.md`](../normalization.md)          | One dialect end-to-end; one shared module per duplicated pattern; structural wins not micro-opts; Part 1 before flow locomotion                               |
| [`./objects.md`](../objects.md)                      | Hot path = module scratch + generation stamp; **zero** per-tick `{ stepsTo() }`, opts bags, `new TypedArray` in decision tick                                 |
| [`./frame.md`](../frame.md)                          | Shared sync pattern: **sync once · read many** — like `viewport`, not a returned handle object                                                                |
| [`../AI.md`](../../AI.md#future-local-flow-horizons) | Generic loop in `Libraries/AI`; species facts/scorers in game adapters                                                                                        |
| [`../pathfinding.md`](../../pathfinding.md)          | Flow infra detail; HPA + flow hybrid notes for Part 2                                                                                                         |

### What “passthrough” means here

A function, object, param, or layer that exists **only to forward data the caller already has**. In this plan that includes:

- Copying distance/target fields perception → memory → blackboard → scorer (Tier 1b — **dead**, see [`history.md`](history.md))
- Threading `reachSteps` through memory enrich instead of computing once at intent adapter
- `buildNavReachHorizon()` → `{ stepsTo }` closure every agent
- `buildSnakeDecisionContext` / `buildFleeDecisionContext` wrappers that add no logic
- Threading the same config through 3 functions when `getSnakeGameConfig()` at the read site works
- Factory that returns one closure and nothing else
- Second blackboard layer (`visible.*Dist`, `remembered.*Dist`, `known.*Dist`) for the same fact
- **`blackboard` + `decisionSnapshot` as sibling bags** (H2 — viewport/`ElevationCamera` class bug)
- **`facts.visible` / `facts.remembered` copies of `visibleWorld` / memory** — merge once into `known`
- **`readThreatState(world)` reading `blackboard ?? decisionSnapshot`** — one handle only
- **One-export micro-files** whose only caller is another module in the same PR (inline or merge — see Part 1 review in [`history.md`](history.md#part-1-verdict))

**Fix pattern:** compute at the boundary · pass scalars/records once · delete the copies.

### What “stupid shit” means here

From [`../stupid.md`](../stupid.md) — same class of mistakes that already burned us on props, draw, and boot:

| Stupid                                                                                 | Do instead                                                                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveSnakeReachConfig()`, `resolve*Reach*`, any boot getter for static game config  | `getSnakeGameConfig()` at use site                                                                                                          |
| `Libraries/AI/decision/` package or barrel                                             | Concrete file, e.g. `Libraries/AI/agents/deriveThreatState.js`                                                                              |
| “Framework PR” extracting helpers before **both** snake + flee import them             | Same PR wires both consumers or don’t extract                                                                                               |
| Generic perception→memory→blackboard slot pipeline                                     | Shared **functions**, not a pipeline abstraction                                                                                            |
| Behavior-tree layer over intent                                                        | Out of scope                                                                                                                                |
| Pre-bake `fleeRangeCells` on config via boot resolver                                  | Inline `Math.ceil` in threat derive ([`history.md`](history.md))                                                                            |
| `checkReachability` on flow types for decisions                                        | Deleted — use `navReachHorizon.js`                                                                                                          |
| Per-agent `FlowFieldWindow` for **utility scoring**                                    | Sync BFS for decisions; flow windows **Part 2 locomotion only**                                                                             |
| Mock `{ stepsTo: () => N }` in tests                                                   | Real `syncNavReachHorizon` or stub `reachSteps` on context                                                                                  |
| **Compatibility shims / “thin aliases” so tests keep old imports or old object shape** | **Migrate tests in the same PR** — delete shim; see [`../stupid.md`](../stupid.md#tests-follow-the-dialect--never-ship-compatibility-shims) |
| One-export barrels (`import from "../AI/foo/index.js"`)                                | Import owning module directly                                                                                                               |
| Pass F-style file sprawl (5 helpers × 1 consumer)                                      | Merge into the factory file that owns the call site                                                                                         |

---

## Hash / PRNG audit — no `Libraries/Crypto`

**Verdict: No `Libraries/Crypto` folder.** Nothing here is cryptographic. The codebase uses non-cryptographic hashing, integer mixing, deterministic PRNG, and cache-key packing.

**Do instead:** extend `Libraries/Math/hash.js`, `Libraries/Random/`, and keep `Libraries/DataStructures/CellKey.js` as the grid integer dialect.

### Duplicate clusters

| Pattern | Copies | Status |
| --- | --- | --- |
| Salt string → seed | `SeededFeatureHash`, `SeededNoise2D.fromDerived` | ✅ **P1** → `hashSaltString` in `hash.js` |
| LCG PRNG | `SeededRng`, `seededRandom`, `SeededNoise2D` lcg | P2 pending |
| U32 mix | `mixHash4`, `aabbHash` inner loop | P5 pending |

### Warm-path string keys → int (pending)

| Function | File |
| --- | --- |
| `gridCellLosCacheKey` | `gridCellVisionSession.js` — P3 |
| `gridNavCacheKey` | `gridNavEpoch.js` — P4 |
| `centeredGridFrameKey` | `GridCoords.js` — P6 |

### Do not centralize

Sprite/wall atlas LRU strings, `poxelFracture.hashV`, overlay glyph keys — domain/debug keys, cold bake paths.

### Priority queue

| # | Item | Status |
| --- | --- | --- |
| P1 | `hashSaltString` — unify salt loops | ✅ Done |
| P2 | `Random/lcg32.js` — one LCG | Pending |
| P3 | LOS cache key → uint32 | Pending |
| P4 | `gridNavCacheKey` → uint32 | Pending |
| P5 | `hashU32Words` + `aabbHash` DRY | Pending |

### P1 implementation

- `Libraries/Math/hash.js` — added `hashSaltString(rootSeed, salt)`
- `SeededFeatureHash.js` — cell jitter only (`writeSeededFeatureCell`)
- `GridSiteField.js`, `VoronoiEdge.js`, `SeededNoise2D.fromDerived` — import `hashSaltString` from `Libraries/Math/hash.js`

**Review bar:** identical derived seeds/noise samples for same inputs (`proceduralFields.test.js`, `seededNoise2D.test.js`).

**Anti-pattern:** do not replace salt hash with FNV `hashString` — different algorithm by design.

