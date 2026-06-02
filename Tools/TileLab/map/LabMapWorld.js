import { gridSettings } from "../../../Config/Config.js";
import { withSeededRandom } from "../../../Core/SeededRandom.js";
import { mapGenCanvasBounds } from "../LabSettings.js";
import { GamePhase } from "../../../GameState/GamePhase.js";
import { GameState } from "../../../GameState/GameState.js";
import { MapGenerator } from "../../../Generator/MapGenerator.js";
import { getStartNodeLayout } from "../../../Generator/StartNodeBuilding.js";

/**
 * Full run map — same pipeline as a new game (all nodes, walls, obstacle grid).
 * @param {{ mapSeed?: number, floorTileSeed?: number }} options
 */
export function createLabMapWorld(options = {}) {
    const {
        mapSeed = Date.now() & 0x7fffffff,
        floorTileSeed,
    } = options;

    const state = new GameState();
    state.canvasBounds = { ...mapGenCanvasBounds };
    state.phase = GamePhase.COMBAT;

    withSeededRandom(mapSeed, () => {
        MapGenerator.generateMap(state);
    });

    if (floorTileSeed != null) {
        state.floorTileSeed = floorTileSeed;
        state.floorTiles.clear();
    }

    state.__mapSeed = mapSeed;
    return state;
}

/** Move player to a map node combat position; returns world coords. */
export function focusLabNode(state, nodeId) {
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) {
        return { x: state.player.x, y: state.player.y };
    }
    const combatCoords = state.getNodeCombatCoords(node);
    if (nodeId === 0) {
        const layout = getStartNodeLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
        state.player.x = layout.spawnX;
        state.player.y = layout.spawnY;
        return { x: layout.spawnX, y: layout.spawnY };
    }
    state.player.x = combatCoords.x;
    state.player.y = combatCoords.y;
    return { x: combatCoords.x, y: combatCoords.y };
}

export function listLabMapNodes(state) {
    return state.mapNodes
        .map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" }))
        .sort((a, b) => a.layer - b.layer || a.id - b.id);
}
