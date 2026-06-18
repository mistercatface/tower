# Plan

## Config and magic numbers

Right now the tunables are scattered: snake has named constants in `spawnSnakeChain.js` (`segmentCount: 3`, `spacing: 16`, `ballType`) and `snakeAutosim.js` (`eatRadius: 14`), but they're not wired through a single config object and several related values still live elsewhere — `goal_orb` radius 5, `blue_ball` radius 4, HPA `stopRadius: 8` and `pathWaypointArrival` in `hpaGroundNavBehavior`, roll speed/accel in `kineticRollActuator`, and nav replan thresholds inline in `SharedGameState`.

Spacing feeling "too far" is expected: 16px center-to-center on 4px-radius balls leaves an 8px air gap between surfaces. For a tight snake, derive spacing from segment diameter (e.g. `segmentRadius * 2 * linkSlack`, maybe 9–10px) and use the same value for spawn layout and `addChainLink` rest length. Eat radius should be derived too (`headRadius + goalRadius + margin`), not a standalone 14.

Suggested split:

- **Physics config** — collision/sleep/constraint solver (already `GameCollisionSettings` + `LIBRARY_COLLISION_DEFAULTS`); add ground-nav roll defaults and optional chain constraint defaults.
- **Snake game config** — `Config/games/snake.js` (segment spacing/count/type, grow direction, eat margin, cavern seed offset, map gen overrides like `wallHeightLevel: 1`).
- **Game launch config** — `Libraries/Game/gameLaunchers.js` for shell only (title, portrait, camera follow).

At launch, `applySnakeGameConfig()` merges snake config into what autosim/spawn read — same pattern as `applyGameCollisionSettings`. Prop assets keep visual radius; game config references prop ids and computes gameplay distances from loaded asset radii.

## Layer tightening and game layer maturity

The main boundary leak is `Libraries/SandboxEditor` → `Apps/Editor/world/sandboxStartScene` for `spawnSnakePlayScene`, plus snake-specific rules living in `Libraries/Sandbox` (`spawnSnakeChain`, `snakeAutosim`) while the game router calls `controller.loadSnakePlayScene()` / `startSnakeAutosim()` — so "game mode" is a grab bag of controller methods instead of a session type.

Tests reflect that: `spawnSnakeChain.test.js`, `snakeAutosim.test.js`, and `cavernFloorCells.test.js` each build slightly different mock states and hit sandbox modules directly, with no game-layer harness asserting "launch snake → scene + autosim + config."

Tightening path:

- Keep **generic** pieces in Sandbox (`chainLinks`, `goalSeekAutosim`, `cavernFloorCells`, HPA behaviors).
- Move **snake-specific** spawn/rules to `Libraries/Game/snake/`.
- Introduce a thin session on `state.appLaunch` that owns autosim lifecycle and config — controller only forwards `session.tick(dt)`.
- `runGameLaunch` calls `setupGame(state)` per launcher id, not a string action list that reaches back into the controller.
- One harness in `tests/harness/snakeGameHarness.js`; unit tests for generic autosim/chain stay separate.

The game layer stays pragmatic: hide controls, focus viewport, start simulation — not a plugin engine.

## Features that grow physics while polishing snake

- Segment counter / score HUD (proves repeated `addChainLink` under real sim).
- Snapshot round-trip for constraints + `chainHead` (`physics.md` Tier 9).
- Chain-vs-wall integration test (documents tail clipping during growth).
- Optional head speed cap override in snake config (whip control without changing global roll defaults).

For the game layer: launcher row + `setupGame(state)` + config module — puzzle and snake share the shell; editor keeps the stress-chain demo only.

## End game (next milestone)

1. `Config/games/snake.js` owns spacing, eat margin, initial length, grow direction, cavern tweaks — one file to tune feel.
2. Physics tunables stay in physics config; snake only overrides gameplay-specific knobs (e.g. head speed cap).
3. `/?game=snake` and `/?game=puzzle` share one thin launch contract: query → launcher metadata → `setupGame(state)` → sim runs.
4. Snake setup in `Libraries/Game/snake/setupSnakeGame.js`; fixes SandboxEditor → Apps import leak.
5. Segment counter (+ optional `sessionStorage` high score) — minimal HUD for snake only.
6. Head visually distinct (`snake_head` asset or tinted head) — same physics stack.
7. `physics.md` Tier 9: constraints + `chainHead` snapshot export/import.
8. `tests/chainVsWallGrowth.test.js` — growth in narrow cavern fixture, documents tail/wall overlap.
9. Game launch tests assert setup contract via `tests/harness/snakeGameHarness.js`.
10. Adding `/?game=foo` is ~1 PR: launcher row + `Config/games/foo.js` + `setupFooGame(state)`.

---

## Next 3 PRs

### PR 1 — Config extraction and tighter snake feel

Add `Config/games/snake.js` and wire it through spawn, autosim, and play-scene setup so segment spacing is derived from the segment prop radius (not hardcoded 16), eat radius from head + goal radii + margin, and cavern/map overrides (seed offset, wall height) live in one place. Pull ground-nav roll defaults (`maxSpeed`, `accel`, `stopRadius`) into the existing physics config path next to `GameCollisionSettings` so HPA behavior reads shared defaults instead of inline magic. Remove scattered `DEFAULT_SNAKE_*` constants from call sites; props keep visual radii, game config computes gameplay distances. Ship a small test that spacing and eat radius match config + asset radii. Outcome: snake segments sit closer, tuning is one file, physics config is slightly more honest.

### PR 2 — Thin game launch contract and setup module

Replace the action-string pipeline (`loadSnakePlayScene`, `focusChainHead`, …) with a single `setupSnakeGame(state)` in `Libraries/Game/snake/` that composes cavern gen, chain + goal spawn, autosim start, and camera focus on the head — `runGameLaunch` calls `setupGame(state)` per launcher id; puzzle gets the same shape (`setupPuzzleGame`) without changing its behavior. Move snake play-scene logic out of `Apps/Editor/world/sandboxStartScene` and off the sandbox controller (`loadSnakePlayScene` / `startSnakeAutosim` become `state.appLaunch.session` with generic tick forwarding in the controller). Fix the `SandboxEditor → Apps/Editor` import. Add `tests/harness/snakeGameHarness.js` with one smoke test: setup returns `{ head, goal }`, autosim active. Outcome: `/?game=` is "shell + setup hook," adding the next game is a launcher row + config + setup module.

### PR 3 — Polish, HUD, and physics.md payoff

Add a minimal segment counter HUD for snake (optional `sessionStorage` high score), introduce a distinct head visual (`snake_head` asset or head tint) without new engine tiers, and optional head speed cap from snake config for whip control. Land `physics.md` Tier 9 snapshot round-trip for distance constraints + `chainHead` on export/import. Add `tests/chainVsWallGrowth.test.js` — seeded narrow cavern, grow N segments, document tail/wall overlap as baseline. Update `physics.md` percentages. Outcome: snake feels like a small game not a demo, constraint growth is persistable, the next sideshow or trilogy C work has a documented chain stress fixture.
