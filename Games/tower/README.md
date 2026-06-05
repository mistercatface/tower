# Tower (reference game)

This folder is the **game definition** for the shipped tower roguelike. The engine (`Libraries/`, `Systems/`, `Core/`) stays generic; tower-specific wiring lives here and under `Config/`.

## Layout

| Path | Role |
|------|------|
| `gameDefinition.js` | Manifest: FSM states, upgrades factory, bootstrap hooks |
| `config/entities.js` | Enemy + ally definitions, run party, spawn events |
| `tutorial/StartGameIntro.js` | Garbanzo guard intro at run start |
| `tutorial/ClueSearch.js` | Post-fight clue search → horde unlock |
| `tutorial/StartGameBuilding.js` | Opening building layout + spawn slots |
| `hooks.js` | Gameplay hooks wired into engine (combat enter, horde gate, clue search) |
| `content/inspect/` | Jacko + crate inspect meshes and catalog registration |
| `content/world3d/` | Barrel/crate combat prop draw recipes |
| `presets/combat.js` | Pair-filter presets (separation, collision, projectiles) |
| `presets/combatRules.js` | Rule fragments + `inferFaction` resolver |
| `wireRadio.js` | Tower radio content + `brock` main character + pause wiring |
| `targeting.js` | Faction resolver + hostility queries (`Config/content/factions.js`) |

Balance and content remain in `Config/balance/` and `Config/content/` (radio scripts under `Config/content/radio/`).

Radio engine lives in `Libraries/Radio/`; tower wires it via `gameDefinition.wireRadio`.

## New game

1. Copy `Games/tower/` → `Games/my-game/`
2. Edit `gameDefinition.js` (states, hooks, canvas id)
3. Point `main.js` at your manifest: `createGame(myGame)`
4. Add or fork `Config/` content for your game

## Do not

- Hand-wire `Libraries/` into a new project (see `shell` anti-pattern)
- Put game-specific resolvers in `Libraries/Interaction/`
