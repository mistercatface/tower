import { createGame } from "./Core/createGame.js";
import { loadPropAssets } from "./Libraries/Content/loadPropAssets.js";
import { poolGame } from "./Games/pool/gameDefinition.js";

loadPropAssets();
createGame(poolGame);
