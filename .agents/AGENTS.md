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
node scripts/audit-test-leaks.mjs
node scripts/audit-scalar-dialect.mjs
node scripts/audit-codebase.mjs Libraries/<area>   # path filter on changed dirs
npm run audit:all                                   # full gate before merge
```

`node scripts/audit-codebase.mjs --help` lists rules. Fail on: non-index re-export barrels, deleted passthrough symbols in monoliths, legacy sandbox drag APIs, test-only library exports, inline `mock*` factories in test files (use harness).

Warnings (`--warn`) are baseline debt — do not introduce new failures.

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

- ViewBounds storage is an instance `Float32Array` SoA (4 tiers × stride 4). Never put camera tiers in `ENGINE_F32` scratch.
- Callers use `viewport.boundsBuf` + `VIEW_TIER.*` offsets — **no** `{ buf, o }` handles, **no** `boundsF32`.
- Viewport screen/world mapping is `(buf, o, …)` only (`screenToWorldF32` / `worldToScreenF32`) — **no** `return { x, y }`.
- View → registry queries use `queryViewF32` / F32 spatial collect; do not reintroduce `BRIDGE_AABB` on that path.
- Zoom/position changes go through `setZoom` / `setPosition` / `snapTo` / `follow` so bounds recompute.
- Tests/harnesses mock `circleInBounds` / F32 mapping — no production branches for Node.
