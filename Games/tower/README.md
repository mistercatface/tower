# Tower (reference game)

This folder is the **game definition** for the shipped tower roguelike. The engine (`Libraries/`, `Systems/`, `Core/`) stays generic; tower-specific wiring lives here and under `Config/`.

## Layout

| Path | Role |
|------|------|
| `gameDefinition.js` | Manifest: FSM states, upgrades factory, bootstrap hooks |
| `config/runScenes.js` | Ordered run scene config (intro, clue search, main combat) |
| `config/startLayout.js` | Opening building grid + named spawn slots |
| `config/entities.js` | Enemy + ally definitions, run party, spawn events |
| `runScenePorts.js` | Injected ports: layout, radio registry, spawn apply |
| `worldGen.js` | World-gen port: start strategy, layout provider |
| `tutorial/StartGameBuilding.js` | Opening building generator (interprets `startLayout.js`) |
| `hooks.js` | Gameplay hooks wired into engine (combat enter, run scene tick) |
| `content/inspect/` | Jacko + crate inspect meshes and catalog registration |
| `content/world3d/` | Barrel/crate combat prop draw recipes |
| `presets/combat.js` | Pair-filter presets (separation, collision, projectiles) |
| `presets/combatRules.js` | Rule fragments + `inferFaction` resolver |
| `wireRadio.js` | Tower radio content + `brock` main character + pause wiring |
| `targeting.js` | Faction resolver + hostility queries (`Config/content/factions.js`) |

Balance and content remain in `Config/balance/` and `Config/content/` (radio scripts under `Config/content/radio/`).

Run scene engine lives in `Libraries/RunScene/`; tower wires it via `config/runScenes.js` + `runScenePorts.js`.

Radio engine lives in `Libraries/Radio/`; tower wires it via `gameDefinition.wireRadio`.

## New game

1. Copy `Games/tower/` → `Games/my-game/`
2. Implement `gameDefinition.js` with required ports: `combatPairs`, `targeting`, `render`, `worldGen`
3. Add `config/runScenes.js`, `config/entities.js`, layout + `worldGen.strategies`
4. Point `main.js` at your manifest: `createGame(myGame)`
5. Fork `Config/` content as needed (factions, guns, radio, balance)

Engine code must not import `Games/my-game/` — only `getActiveGameDefinition()` / `Core/GamePorts.js`.

## Do not

- Hand-wire `Libraries/` into a new project (see `shell` anti-pattern)
- Put game-specific resolvers in `Libraries/Interaction/`
