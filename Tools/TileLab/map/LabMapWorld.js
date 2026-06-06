import { gridSettings } from "../../../Config/Config.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { mapGenCanvasBounds } from "../LabSettings.js";
import { GamePhase } from "../../../GameState/GamePhase.js";
import { GameState } from "../../../GameState/GameState.js";
import { getWorldGen } from "../../../Core/GamePorts.js";
import { MapGenerator } from "../../../Generator/MapGenerator.js";
import { ensureLabGameDefinition } from "../../Lab/ensureLabGameDefinition.js";

/**
 * Full run map — same pipeline as a new game (all nodes, walls, obstacle grid).
 * @param {{ mapSeed?: number, worldSurfaceSeed?: number }} options
 */
export function createLabMapWorld(options = {}) {
    const {
        mapSeed = Date.now() & 0x7fffffff,
        worldSurfaceSeed,
    } = options;

    ensureLabGameDefinition();

    const state = new GameState();
    state.canvasBounds = { ...mapGenCanvasBounds };
    state.phase = GamePhase.SIMULATION;

    withSeededRandom(mapSeed, () => {
        MapGenerator.generateMap(state);
    });

    if (worldSurfaceSeed != null) {
        state.worldSurfaceSeed = worldSurfaceSeed;
        state.worldSurfaces.clear();
    }

    return state;
}

/** Move player to a map node combat position; returns world coords. */
export function focusLabNode(state, nodeId) {
    ensureLabGameDefinition();
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) {
        return { x: state.player.x, y: state.player.y };
    }
    const combatCoords = state.getNodeCombatCoords(node);
    const startNodeId = getWorldGen().startMapNodeId ?? 0;
    if (nodeId === startNodeId) {
        const layout = getWorldGen().getStartLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
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
