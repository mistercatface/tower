import { createGame } from "./Core/createGame.js";
import { resolveGameFromUrl } from "./Core/gameRegistry.js";
import { loadPropAssets } from "./Libraries/Content/loadPropAssets.js";

loadPropAssets();
createGame(resolveGameFromUrl());
