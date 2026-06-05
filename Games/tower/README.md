# Tower (reference game)

This folder is the **game definition** for the shipped tower roguelike. The engine (`Libraries/`, `Systems/`, `Core/`) stays generic; tower-specific wiring lives here and under `Config/`.

## Layout

| Path | Role |
|------|------|
| `gameDefinition.js` | Manifest: FSM states, upgrades factory, bootstrap hooks |
| `presets/combat.js` | Pair-filter presets (separation, collision, projectiles) |
| `presets/combatRules.js` | Rule fragments + `inferFaction` resolver |

Balance and content remain in `Config/balance/` and `Config/content/`.

## New game

1. Copy `Games/tower/` → `Games/my-game/`
2. Edit `gameDefinition.js` (states, hooks, canvas id)
3. Point `main.js` at your manifest: `createGame(myGame)`
4. Add or fork `Config/` content for your game

## Do not

- Hand-wire `Libraries/` into a new project (see `shell` anti-pattern)
- Put game-specific resolvers in `Libraries/Interaction/`
