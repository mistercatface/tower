import { getActiveGameDefinition, setActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { bootstrapEngine } from "../../Core/bootstrapEngine.js";
import { towerGame } from "../../Games/tower/gameDefinition.js";
import { getWorldPropDefinitions } from "../../Libraries/Content/PropCatalog.js";
import { loadPropAssets } from "../../Libraries/Content/loadPropAssets.js";

let labEngineBootstrapped = false;

/**
 * MapLab / TileLab call engine map generation without createGame().
 * Installs the Tower game definition and runs engine bootstrap once.
 */
export function ensureLabGameDefinition() {
    if (Object.keys(getWorldPropDefinitions()).length === 0) loadPropAssets();
    if (!getActiveGameDefinition()) setActiveGameDefinition(towerGame);
    if (!labEngineBootstrapped) {
        bootstrapEngine(towerGame);
        labEngineBootstrapped = true;
    }
}
