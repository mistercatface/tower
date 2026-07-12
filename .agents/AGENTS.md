# Workspace Agent Rules

These rules are project-scoped behavior constraints for all AI agents editing the `tower` codebase.

## 1. Test Decoupling & Stability

- **KEEP TEST SPECIFIC CODE INSIDE THE TEST FOLDER. DO NOT PUT TEST CODE OUTSIDE THE TEST FOLDER.**
- **Consolidate Mocks**: Reuse harness files inside `tests/harness/` — not inline mocks in test files when used 2+ times.
- **No test-only exports in `Libraries/`** — no `*ForTests` symbols, no production branches loosened for test convenience.
- **Tests adapt to production contracts** — harness builds real wiring (`createKineticSession`, `WorldObstacleGrid`, `sandboxDragHarness`, etc.).

## 2. Test Execution

- **Run tests via Node directly**: `node scripts/run-tests.mjs tests/foo.test.js` or `npm run test:all` — not through `cmd.exe /c`.
- **Targeted runs** — one file or feature scope; avoid full suite unless the change warrants it.
- **Timeout runner** — prefer `node scripts/run-tests.mjs` over bare `node --test`.

## 3. Code Hygiene Audits

Before adding exports under `Libraries/` or finishing a feature that touches `Libraries/`:

```powershell
node scripts/audit-codebase.mjs Libraries/<area>   # path filter on changed dirs
npm run audit                                       # fail-only gate
npm run audit:all                                   # failures + warnings
```

`node scripts/audit-codebase.mjs --help` lists rules. Fail on: non-index re-export barrels, deleted passthrough symbols in monoliths, legacy sandbox drag APIs, test-only library exports, inline `mock*` factories in test files (use harness), `*_SCRATCH` exports from hot-path libs, new XY/AABB bag exports from `Core/engineMemory.js`, legacy viewport/scalar symbols.

Warnings (`--warn`) are baseline debt — do not introduce new failures. Also warn on: F32→object rebox, module `*_SCRATCH`, pair-return bags, object-bag `*Into*`, dual bag+F32 APIs, hot-path `.push({`.

## 4. Style Guards (do not reintroduce)

- No `@param` / inner `@type` in function bodies — see `.cursor/rules/jsdoc-minimal.mdc`.
- No new file splits for organization only — extend existing modules unless a real subsystem boundary.
- No fallbacks without explicit user approval — see `.cursor/rules/no-fallbacks.mdc`.
- Import from owning modules directly — minimal barrels only at package entry (`minimal-barrels.mdc`).

## 5. Grid edit → surface invalidate contract

`commitGridNavEdit(state, region, …)` and `WorldSurfaceEngine.invalidateGridBounds(region, grid)` share one `region` shape:

- `null` — full grid (with `fullNavSync` / full surface clear)
- `number` — single cell index
- CellBounds (`startCol`/`endCol`/`startRow`/`endRow`) — inclusive rectangle (wall batches, shatter flush)

Anything else must throw. Wall shatter goes quiet clear → `commitGridWallBatch(bounds)` → this path; do not stub `invalidateGridBounds` as a no-op when asserting roof/draw teardown after shatter.

## 6. Viewport / view bounds dialect

- Camera AABB: `viewBoundsBuf` + `VIEW_TIER_CLIP` / `VIEW_TIER_PROPS` / `VIEW_TIER_STRUCTURE` / `VIEW_TIER_CHUNKS` number consts in `Core/engineMemory.js` (session SoA, 4 tiers × stride 4). No `VIEW_TIER` object bag.
- Viewport zoom/position APIs call `recomputeViewBounds`; never store tiers on Viewport. Use `circleInViewBounds` for visibility (not `viewport.circleInBounds`).
- Never put camera tiers in `ENGINE_F32` Bounds bank (`B_*` are ephemeral scratch only).
- Viewport screen/world mapping is `(buf, o, …)` only (`screenToWorldF32` / `worldToScreenF32`) — **no** `return { x, y }`.
- View → registry queries return **count**; ids via `borrowedQueryIds(filterId)`. Camera: `queryViewTier(spatialFrame, tierO, filterId, match)`. Scratch AABB: `queryInAabbF32(…, buf, o, …)`. Intersection is circle vs AABB via eid SoA (`entityX`/`entityY`/`entityR`). No criteria/`opts` bags; no `queryPropIdsInView` passthrough. Do not reintroduce `BRIDGE_AABB` on that path.
- Modes (`SHAPE_TYPE_*`, `DRAW_KIND_*`, …) live in `Core/engineEnums.js`. Slabs and buffer layout offsets (`VIEW_TIER_*`) live in `Core/engineMemory.js`. Do not put semantic modes in `engineMemory`. Editor boot lives under `Apps/Editor/`, not a Core globals module.
- Zoom/position changes go through `setZoom` / `setPosition` / `snapTo` / `follow` so bounds recompute.
- Tests/harnesses that mock a viewport without a real `Viewport` must call `recomputeViewBounds` when visibility matters — no production branches for Node.

## 7. engineMemory bar + object diet

`Core/engineMemory.js` is not a junk drawer for bags. Three layers:

| Layer | Put here | Do not put here |
|-------|----------|-----------------|
| `ENGINE_F32` named slots | Ephemeral outs (snap XY, steer, closest, AABB scratch). **All bank slot consts (`M_*`/`P_*`/`G_*`/`F_*`/`S_*`/`N_*`/`B_*`/`R_*`) live only in `engineMemory`.** Libraries may keep subarray *views* (`SAT_RESULT`, etc.), not layout ownership. Body radius is `body.radius` only — no resolver. | Growable paths, topology, session clocks, camera tiers |
| Dedicated slabs / SoA | Persistent columns (`entityX`, kinetic slabs, wall segments), `viewBoundsBuf` | One-off `{x,y}` helpers, dual bag+F32 twins |
| Session / SAB / local | Worker paths, HPA graphs, editor caches | Parking more object bags in Core “for convenience” |

Illegal diet patterns (audits should catch; do not introduce):

- `*Into*` that writes `out.x` / `out.minX` instead of `(buf, o)` / named `ENGINE_F32` slots
- Reboxing: `{ x: ENGINE_F32[…], y: ENGINE_F32[…] }` after an Into/F32 write
- Dual APIs: `foo` (bag) + `fooF32` / object `fooInto` — delete the bag path
- New `export const *_SCRATCH = { x, y }` or AABB bag factories in hot libs / `engineMemory`
- Hot-path `.push({ … })` in Spatial/Physics/Navigation/Math/Sandbox

Legal: SoA slab objects already in `engineMemory` (typed columns + `count`); `GrowI32`/`GrowF32`; `viewBoundsBuf` camera SoA (not `ENGINE_F32`).

Before adding exports under `Libraries/` or `Core/engineMemory.js`:
`npm run audit:all` and `node scripts/audit-codebase.mjs --warn Libraries/<area>`.
