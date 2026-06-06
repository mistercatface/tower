# Tower (reference game)

This folder is the **game definition** for the shipped tower roguelike. The engine (`Libraries/`, `Systems/`, `Core/`) stays generic; tower-specific wiring lives here and under `Config/`.

## Layout

| Path | Role |
|------|------|
| `gameDefinition.js` | Manifest: FSM states, upgrades factory, bootstrap hooks |
| `simulation.js` | Simulation phase pipeline (`simulationPort`: combat, physics, horde, inspector) |
| `ports.js` | `interactionPairs`, `targeting`, `render` port bundle |
| `config/runScenes.js` | Ordered run scene config (intro, clue search, main combat) |
| `config/startLayout.js` | Opening building grid + named spawn slots |
| `config/entities.js` | Enemy + ally definitions, run party, spawn events |
| `runScenePorts.js` | Injected ports: layout, radio registry, spawn apply |
| `worldGen.js` | World-gen port: start strategy, layout provider |
| `tutorial/StartGameBuilding.js` | Opening building generator (interprets `startLayout.js`) |
| `hooks.js` | Gameplay hooks wired into engine (scene enter, run scene tick) |
| `content/inspect/` | Fuel barrel + crate inspect meshes and catalog registration |
| `presets/combatInteraction.js` | Combat interaction overrides (faction, projectiles, separation) |
| `presets/combatInteractionRules.js` | Tower faction rule fragments |
| `wireRadio.js` | Tower radio content + `brock` main character + pause wiring |
| `targeting.js` | Faction resolver + hostility queries (`Config/content/factions.js`) |

Shared character/gun visuals live in `Assets/characters/` and `Assets/guns/`; kinematics defaults in `Libraries/Kinematics/` + `Libraries/Render/Characters/`. Tower wires appearance + gun visual map via `ports.js` → `createDefaultKinematicsPorts()`.

Balance and content remain in `Config/balance/` and `Config/content/` (radio scripts under `Config/content/radio/`).

Run scene engine lives in `Libraries/RunScene/`; tower wires it via `config/runScenes.js` + `runScenePorts.js`.

Radio engine lives in `Libraries/Radio/`; tower wires it via `gameDefinition.wireRadio`.

Simulation engine lives in `Systems/Simulation/`; tower wires it via `simulation.js` → `gameDefinition.simulationPort`. FSM `states.simulation` (`SimulationState`) delegates tick/enter to that port.

## New game

1. Copy `Games/tower/` → `Games/my-game/`
2. Implement `gameDefinition.js` with required ports: `simulationPort`, `targeting`, `render`, `worldGen`; optional `interactionPairs` for combat overrides
3. Add `simulation.js` (phase list via `createSimulationPort`), `config/runScenes.js`, `config/entities.js`, layout + `worldGen.strategies`
4. Point `main.js` at your manifest: `createGame(myGame)`
5. Fork `Config/` content as needed (factions, guns, radio, balance)

Engine code must not import `Games/my-game/` — only `getActiveGameDefinition()` / `Core/GamePorts.js`.

## Do not

- Hand-wire `Libraries/` into a new project (see `shell` anti-pattern)
- Put game-specific resolvers in `Libraries/Interaction/`
