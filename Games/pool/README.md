# Pool

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

Skip opening coach line: `?scene=play`

## Architecture

| Module                   | Role                                                        |
| ------------------------ | ----------------------------------------------------------- |
| `runScenePort.js`        | Run enter/tick: spawn balls, pockets, opening/clear radios  |
| `PoolTableStrategy.js`   | Rectangular rail walls                                      |
| `config/tableLayout.js`  | Table size, pockets, ball spawns                            |
| `shotInput.js`           | Drag aim + strike                                           |
| `pockets.js`             | Pocket sensors                                              |
| `balls.js`               | Cue/object balls, stop detection                            |
| `PoolSimulationState.js` | Camera, overlays, input                                     |
| `simulation.js`          | Physics phase pipeline (`gameDefinition.simulationPort`)    |
| `ui/poolUiPort.js`       | Table status HUD + shell controls (`gameDefinition.uiPort`) |
| `poolHud.js`             | Status message helper for DOM HUD                           |
