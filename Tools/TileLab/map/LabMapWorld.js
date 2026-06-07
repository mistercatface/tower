import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { SharedGameState } from "../../../GameState/SharedGameState.js";
import { createRoguelikeNavRuntime } from "../../../Libraries/Navigation/createRoguelikeNavRuntime.js";
import { generateWorld, getWorldGen } from "../../../Core/GamePorts.js";
import { ensureLabGameDefinition } from "../../Lab/ensureLabGameDefinition.js";
import { mapGenCanvasBounds } from "../LabSettings.js";
import { gridSettings } from "../../../Config/Config.js";
class LabMapState extends SharedGameState {
    constructor() {
        super();
        createRoguelikeNavRuntime(this);
        this._labFocus = { x: 0, y: 0 };
    }
}
/**
 * Full run map — same pipeline as a new game (all nodes, walls, obstacle grid).
 * @param {{ mapSeed?: number, worldSurfaceSeed?: number }} options
 */
export function createLabMapWorld(options = {}) {
    const { mapSeed = Date.now() & 0x7fffffff, worldSurfaceSeed } = options;
    ensureLabGameDefinition();
    const state = new LabMapState();
    state.canvasBounds = { ...mapGenCanvasBounds };
    state.phase = "simulation";
    withSeededRandom(mapSeed, () => {
        generateWorld(state);
    });
    if (worldSurfaceSeed != null) {
        state.worldSurfaceSeed = worldSurfaceSeed;
        state.worldSurfaces.clear();
    }
    focusLabNode(state, 0);
    return state;
}

export function getLabFocus(state) {
    return state._labFocus ?? { x: 0, y: 0 };
}

export function setLabFocus(state, x, y) {
    state._labFocus = { x, y };
}
/** Move lab camera focus to a map node; returns world coords. */
export function focusLabNode(state, nodeId) {
    ensureLabGameDefinition();
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) return state._labFocus;
    const worldCoords = state.getNodeWorldCoords(node);
    const startNodeId = getWorldGen().startMapNodeId ?? 0;
    if (nodeId === startNodeId) {
        const layout = getWorldGen().getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
        state._labFocus = { x: layout.spawnX, y: layout.spawnY };
    } else state._labFocus = { x: worldCoords.x, y: worldCoords.y };
    return state._labFocus;
}
export function listLabMapNodes(state) {
    return state.mapNodes.map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" })).sort((a, b) => a.layer - b.layer || a.id - b.id);
}
