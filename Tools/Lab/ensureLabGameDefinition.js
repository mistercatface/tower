import { getActiveGameDefinition, setActiveGameDefinition } from "../../Core/ActiveGameDefinition.js";
import { towerGame } from "../../Games/tower/gameDefinition.js";

/**
 * MapLab / TileLab call engine map generation without createGame().
 * Install the Tower game definition so GamePorts (worldGen, etc.) resolve.
 */
export function ensureLabGameDefinition() {
    if (!getActiveGameDefinition()) setActiveGameDefinition(towerGame);
}
