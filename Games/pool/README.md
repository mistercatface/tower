# Pool (Phase 1)

Three-ball pool on a rectangular table. Not tower. Not yard ball.

## Play

1. **Drag backward from the cue ball** (white), release to shoot
2. Wait for balls to stop before the next shot
3. **Sink both red/yellow object balls** in any of the six pockets
4. Cue ball in pocket → respots at head spot

## Boot

```js
import { poolGame } from "./Games/pool/gameDefinition.js";
createGame(poolGame);
```

Skip intro: `?scene=play`

## Architecture

| Module | Role |
|--------|------|
| `PoolTableStrategy.js` | Rectangular rail walls |
| `config/tableLayout.js` | Table size, pockets, ball spawns |
| `shotInput.js` | Drag aim + strike |
| `pockets.js` | Pocket sensors |
| `balls.js` | Cue/object balls, stop detection |
| `PoolSimulationState.js` | Camera, overlays, input |
