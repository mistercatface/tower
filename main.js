import { createGame } from "./Core/createGame.js";
import { loadPropAssets } from "./Libraries/Content/loadPropAssets.js";
import { yardballGame } from "./Games/yardball/gameDefinition.js";

loadPropAssets();
createGame(yardballGame);
