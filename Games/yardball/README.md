# Yard Ball

A spinoff game built on the tower engine. **Not a reskin.**

## What you do

- **Tap** anywhere to nudge the beach ball toward that point
- Roll through the opening building (crates are obstacles from the normal start-node prop scatter)
- Sink the ball in the **neon goal ring** at the foyer slot
- No guns, no horde, no inspect clue hunt

## Boot

In `main.js`, swap the game import:

```js
import { yardballGame } from "./Games/yardball/gameDefinition.js";
createGame(yardballGame);
```

Dev scene skip: `?scene=roll_to_goal`

## Files

| Path | Role |
|------|------|
| `gameDefinition.js` | Manifest + custom `YardballCombatState` |
| `CombatState.js` | Tap input, camera follows ball, goal ring overlay |
| `ball.js` | Hero ball lookup, nudge impulse, goal test |
| `hooks.js` | Spawn ball, hide player, goal detection |
| `config/runScenes.js` | kickoff → roll → sunk |
| `worldGen.js` | Reuses tower `StartGameBuilding` |

## Design thesis

**Verb:** nudge / roll (physics), not shoot / survive (combat).
