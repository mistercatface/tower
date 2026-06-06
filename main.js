import { createGame } from "./Core/createGame.js";
import { loadPropAssets } from "./Libraries/Content/loadPropAssets.js";
import { towerGame } from "./Games/tower/gameDefinition.js";

loadPropAssets();
createGame(towerGame);
