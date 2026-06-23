# Entity `queryView` — result buffer pooling

Pool registry-owned result arrays on cache miss so the render pass stops allocating fresh `[]` every frame under entity-heavy scenes.

**Sibling docs:** index → [`normalization.md`](normalization.md) #5 · game-changer slot → [`gamechangers.md`](gamechangers.md) G4 · perf lens → [`objects.md`](objects.md) Tier 2 #7

---

## Is this a big normalization?

**No.** This is a **registry-internal perf fix**, not a call-site dialect migration like viewport or AABB.

| Question | Answer |
|----------|--------|
| Do all queries go through one new API? | **No change required.** Existing paths stay as-is. |
| Are `filterId` strings new? | **No.** Call sites already pass them; pooling just reuses them as buffer slot keys inside `EntityRegistry`. |
| Is render already centralized? | **Mostly yes.** Debris / floor / 3D / overlays / prop tiles go through `queryPropsInView` → `queryView`. Two direct callers remain (`snakeFood.js`, `findWorldPropAtInView`). |
| What *would* be a normalization follow-up? | Optional: export `QUERY_VIEW_FILTER_IDS` constants, route the two direct callers through `queryPropsInView`, or add `queryViewInto(out, …)`. **Out of scope** for pooling v1 — do only if string drift becomes annoying. |

**Mental model:** same as `_candidateScratch` — callers keep calling `queryView` / `queryPropsInView`; the registry stops throwing away output arrays on miss.

---

## Why not put this on `Viewport`?

**Short answer:** viewport normalization and `queryView` pooling are **orthogonal layers**. This work should not migrate onto `Viewport`, and it is unlikely to reveal that “it all belonged on viewport anyway.”

### What viewport owns (per [`frame.md`](frame.md))

| Viewport | Not viewport |
|----------|--------------|
| Camera: `x`, `y`, `zoom` | Entity masterlist |
| Tier bounds: `bounds("props")`, `bounds("chunks")` | Spatial broadphase (`kineticSpatial`) |
| Cull **tests**: `circleInBounds`, `entityInBounds`, `aabbInBounds` | Membership generation, query cache |
| Screen ↔ world mapping | Which props match `renderMode === "floor"` |

`frame.md` rule: *“Scene (entities, grid, surfaces) → `state` — **not** viewport.”*

### What `queryView` actually needs

```
bounds        ← viewport.bounds(tier)     [camera-dependent]
spatialGen    ← kineticSpatial.frameId    [sim/render pass]
membershipGen ← entityRegistry            [add/remove props]
filterId/match← render layer semantics   [not camera data]
result buffer ← registry-owned scratch   [tied to cache + membership]
```

Viewport supplies **one input** (the AABB). The cache keys, spatial broadphase, and result lifetime all live on **`EntityRegistry` + `SpatialFrame`**. Moving result buffers to `Viewport` would:

- Require passing `entityRegistry` and `spatialFrame` **into** viewport anyway (no fewer params).
- Put scratch that invalidates on **entity add/remove** on an object that conceptually tracks **camera**.
- Not fix the main miss driver (`spatialGen` bump from `kineticSpatial.begin` in sim **and** render).

### The glue is already in the right place

```javascript
// sandboxOverlayCommands.js — viewport gives bounds; registry runs query
queryPropsInView(entityRegistry, viewport, spatialFrame, { filterId, match, hitTest, tier })
  → entityRegistry.queryView({ bounds: viewport.bounds(tier), ... }, spatialFrame)
```

That is **composition**, not a missing viewport method. A `viewport.queryProps(...)` wrapper would still need registry + spatial frame passed in — same arity, wrong owner per `frame.md`.

### Callers that are not viewport-scoped

| Caller | Bounds source | Why not viewport |
|--------|---------------|------------------|
| `snakeFood.js` | Agent-local AABB | Sim / AI, no draw camera |
| `findWorldPropAtInView` | Click-point search AABB | Pick radius, not tier cull |

Pooling on registry helps all of these; viewport-only pooling would not.

### What *could* merge later (different work)

| Idea | Layer | Relation to pooling |
|------|-------|---------------------|
| Per-frame draw pass struct (G7) | Renderer / pass | Might **hold** query results for one frame — still filled **by** `queryView`, not owned by viewport |
| Decouple query cache gen from `frameId` | `KineticSpatialFrame` | Reduces miss **rate**; buffers still on registry |
| `queryPropsInView` → renderer method | Ergonomics | Cosmetic; no viewport ownership |

**Conclusion:** Implement pooling in `EntityRegistry`. Do not block on or fold into viewport work. If anything moves, it would be toward a **draw-pass** cache (frame.md G7), not `Viewport` itself.

---

## Problem (current state)

`EntityRegistry` pools **intermediate** scratch (`_candidateScratch`, `_kindSetScratch`, `_candidateSeenIds`) but **output** arrays are still allocated on every cache miss:

```javascript
// _queryInAabb — full miss
const result = [];
for (...) result.push(ref);

// queryView — derived from base cache + match
result = [];
for (...) if (criteria.match(ref)) result.push(ref);
```

**Why misses are frequent in render**

| Factor | Effect |
|--------|--------|
| `kineticSpatial.begin(state)` in sim **and** render (`Apps/Editor/engine.js`, `Render/Render.js`) | `spatialFrame.frameId` bumps twice per frame → cache key always new for render |
| 3–5 `queryView` calls per draw pass | debris, floor, 3d, overlay, propTile |
| Entity-heavy scenes | Large arrays → more GC pressure per miss |

**Good news:** call sites iterate immediately and copy into `visibleDrawables`; none push/splice/sort the query result itself.

---

## Target contract (AABB-style)

Same rules as `chunkWorldAabbScratch` / `*Into` APIs:

1. **Return value is registry-owned** — do not store the array reference across frames or across another `queryView` with the same `filterId`.
2. **Read-only iteration** — index `result[i]` in the same synchronous call stack; copy refs elsewhere if needed (`visibleDrawables` already does this).
3. **Length is authoritative** — `result.length` is the count.

Optional later: `queryViewInto(out, …)` — not needed for v1 given current call sites.

---

## Known query slots (`filterId`)

These are **documentation of existing call-site strings**, not a new registry of query types. The registry lazily creates one reusable `[]` per distinct `filterId` it sees.

| `filterId` | Entry point | Hot path |
|------------|-------------|----------|
| `"debris"` | `WorldSceneRenderer.drawDebrisProps` → `queryPropsInView` | Every frame |
| `"floor"` | `WorldSceneRenderer.drawFloorProps` → `queryPropsInView` | Every frame |
| `"3d"` | `WorldSceneRenderer._appendVisible3dProps` → `queryPropsInView` | Every frame |
| `"overlay"` | `queryPropsInView` default | Overlays |
| `"propTile"` | `appendPropTileCellOverlayCommands` → `queryPropsInView` | Editor |
| `"selectedOverlay"` | `buildSandboxOverlayCommands` → `queryPropsInView` | Editor |
| `"snakeFood"` | `snakeFood.js` → `queryView` direct | Sim |
| `""` (missing) | `findWorldPropAtInView` → `queryView` direct | Input pick |

**Render invariant (why one buffer per `filterId` is safe):** the hot pass uses the same viewport tier bounds with **different** `filterId`s per layer — no two same-slot queries with different bounds in one synchronous render slice.

---

## Recommended design

### Slot buffers keyed by `filterId`

```javascript
// EntityRegistry constructor
this._resultSlotByFilterId = Object.create(null);

_borrowQueryResultBuffer(filterId) {
    const key = filterId ?? "";
    let buf = this._resultSlotByFilterId[key];
    if (!buf) buf = this._resultSlotByFilterId[key] = [];
    buf.length = 0;
    return buf;
}
```

### Wire into three fill paths

1. `_queryInAabb` — replace `const result = []` with `_borrowQueryResultBuffer(filterId)` (thread `filterId` from criteria).
2. `queryView` derived-filter path (base cache hit + `match`) — same borrow.
3. Cache entry creation — `makeQueryViewCacheEntry(borrowedBuf, …)` stores the slot buffer pointer.

### Collision escape hatch

If `_viewQueryDepth > 1` or a re-entrant second query for the same slot is detected (same `filterId`, different bounds, same stack — rare):

- Fall back to a small depth stack (`_resultDepthScratch[]`) or one-off `[]`, mirroring `_candidateScratch` today.
- Render path stays depth 1; no call-site changes expected.

---

## Implementation phases

### Phase 1 — Core pooling (~1 file, ~40 lines)

**File:** `GameState/EntityRegistry.js`

- Add `_resultSlotByFilterId`, `_borrowQueryResultBuffer(filterId)`.
- Pass `filterId` into `_queryInAabb`.
- Replace both `result = []` allocation sites.
- JSDoc on `queryView`: *"Returned array is registry-owned; do not retain."*

**Review bar**

- [ ] Cache miss for `"debris"` / `"floor"` / `"3d"` does not allocate `[]`.
- [ ] Cache hit still returns same buffer reference (behavior unchanged).
- [ ] `membershipGen` bump still clears `_queryCache` (buffers survive; only Map cleared).

### Phase 2 — Call-site audit (read-only)

Confirm no retained references or in-place mutation:

| File | Usage |
|------|-------|
| `Libraries/Render/WorldSceneRenderer.js` | 3× iterate → copy to `visibleDrawables` |
| `Libraries/Sandbox/sandboxOverlayCommands.js` | `queryPropsInView` wrapper + propTile loop |
| `Libraries/SandboxEditor/buildSandboxOverlayCommands.js` | selected overlay |
| `Libraries/Game/snake/snakeFood.js` | sim food query |
| `GameState/EntityRegistry.js` | `findWorldPropAtInView` pick |

**Expected outcome:** zero call-site edits.

### Phase 3 — Verify

1. **Allocation check:** DevTools Performance → record render loop; `Array` construction in `queryView` / `_queryInAabb` → ~0 steady-state.
2. **Functional:** debris/floor/3d draw order unchanged; editor selection rings; snake food pickup.
3. **Stress:** many props, pan/zoom — no missing drawables (would indicate buffer stomping).

---

## Out of scope (optional follow-ups)

| Follow-up | Why separate |
|-----------|--------------|
| **Decouple cache `spatialGen` from per-pass `frameId`** | Fixes *miss rate*, not allocation shape. Needs a stable "entity grid generation" on `KineticSpatialFrame`. |
| **`queryViewInto(out, criteria, spatialFrame)`** | Lets callers append directly into `visibleDrawables` and skip copy loops. |
| **Centralize `filterId` constants** | Small hygiene (`QUERY_VIEW_FILTER_IDS.debris` etc.); not required for pooling. |
| **Route all callers through `queryPropsInView`** | Would unify the two direct `queryView` callers; cosmetic unless we add shared defaults. |
| **Nested `_viewQueryDepth > 1` allocs** | `new Set()` / `[]` for candidates when re-entrant; not on render hot path. |
| **`queryInAabbStrict` pooling** | Editor box-select; cold path. |
| **Prune stale `_queryCache` entries on spatial bump** | Map hygiene until `membershipGen` bump. |

---

## Risk matrix

| Risk | Mitigation |
|------|------------|
| Caller retains result array | Audit + JSDoc; none found today |
| Same `filterId`, two bounds, one frame | Depth stack or alloc fallback |
| Cache entry points at slot buffer cleared by next same-slot query | Safe on render path: distinct `filterId` per layer; document invariant |
| Profiling shows little gain | Payoff scales with visible entity count |

---

## Success criteria

- Steady-state render: **0 new `[]` from `queryView` on cache miss** for hot `filterId`s.
- No visual/behavior regressions in draw passes or editor overlays.
- Same public API — no signature changes, no render-stack churn.

**Effort:** ~2–3 h total (implement + audit + smoke test).
