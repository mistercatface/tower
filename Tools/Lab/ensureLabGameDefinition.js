import { getActiveGameDefinition, setActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { loadPropAssets } from "../../Libraries/Content/loadPropAssets.js";
import { towerGame } from "../../Games/tower/gameDefinition.js";

/**
 * MapLab / TileLab call engine map generation without createGame().
 * Install the Tower game definition so GamePorts (worldGen, etc.) resolve.
 */
export function ensureLabGameDefinition() {
    if (Object.keys(getWorldPropDefinitions()).length === 0) loadPropAssets();
    if (!getActiveGameDefinition()) setActiveGameDefinition(towerGame);
}
