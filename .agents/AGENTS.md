# Workspace Agent Rules

These rules are project-scoped behavior constraints for all AI agents editing the `tower` codebase.

## 1. Test Decoupling & Stability

- Keep test-specific code inside `tests/`. Do not put test code outside the test folder.
- Consolidate mocks: reuse `tests/harness/` — not inline mocks in test files when used 2+ times.
- No test-only exports in `Libraries/` or `Core/` — no `*ForTests` symbols, no production branches loosened for test convenience, no exports whose only callers are `tests/`. See `.cursor/rules/test-production-boundary.mdc`.
- Tests adapt to production contracts — harness builds real wiring; do not loosen production for easier tests.

## 2. Test Execution

- Run tests via Node with a timeout: `node --test --test-timeout=5000 --import ./tests/testPreload.js tests/foo.test.js` (or `node scripts/run-tests.mjs …`) — not through `cmd.exe /c`.
- Targeted runs — one file or feature scope; avoid the full suite unless the change warrants it.
- Full suite: prefer `--test-concurrency=1` when shared SoA/worker module state can flake under parallel files.

## 3. Code Hygiene Audits

Before adding exports under `Libraries/` or finishing a feature that touches `Libraries/`:

1. **Manual caller map** (required): grep the new symbol; if only `tests/` imports it → delete or wire into product first. See `test-production-boundary.mdc`.
2. Optional hygiene scripts:

```powershell
node scripts/audit-codebase.mjs Libraries/<area>
npm run audit
npm run audit:all
```

`node scripts/audit-codebase.mjs --help` lists rules. Fail on: non-index re-export barrels, `ForTests` library exports, inline `mock*` factories in test files (use harness), `*_SCRATCH` exports from hot-path libs, new XY/AABB bag exports from `Core/engineMemory.js`.

Warnings (`--warn`) are baseline debt — do not introduce new failures. Also warn on: F32→object rebox, module `*_SCRATCH`, pair-return bags, object-bag `*Into*`, dual bag+F32 APIs, hot-path `.push({`.

## 4. Style Guards

- No `@param` / inner `@type` in function bodies — see `.cursor/rules/jsdoc-minimal.mdc`.
- No new file splits for organization only — extend existing modules unless a real subsystem boundary.
- No fallbacks without explicit user approval — see `.cursor/rules/no-fallbacks.mdc`.
- Import from owning modules directly — minimal barrels only at package entry (`minimal-barrels.mdc`).
