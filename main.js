import { createGame } from "./Core/createGame.js";
import { loadGameFromUrl } from "./Core/gameRegistry.js";
import { loadPropAssets } from "./Libraries/Props/loadPropAssets.js";
loadPropAssets();
loadGameFromUrl().then(createGame);
