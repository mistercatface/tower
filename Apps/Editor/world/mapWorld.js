import { engine } from "../engine.js";
import { gridSettings } from "../../../Config/Config.js";
import { buildGameMapRenderCaches, buildTopologyMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { getRoguelikeMapSession, regenerateRoguelikeMap } from "../../../Libraries/WorldGen/session/index.js";
import { sandboxController } from "./tilelabSandbox.js";
import { spawnSandboxBattleGroups } from "./sandboxBattleSpawn.js";
export function listLabMapNodes(state) {
    return state.mapNodes.map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" })).sort((a, b) => a.layer - b.layer || a.id - b.id);
}
/** @param {import("../state.js").TileLabGameState} state */
export function initEmptyTilelabMap(state) {
    const viewW = state.viewport.width;
    const viewH = state.viewport.height;
    state.mapBaseSpawnX = viewW > 0 ? viewW / 2 : 225;
    state.mapBaseSpawnY = viewH > 0 ? viewH / 2 : 225;
    state.walls = [];
    state.wallSpatialIndex.clear();
    state.mapNodes = [];
    state.mapNodeById.clear();
    state.currentNodeId = 0;
    state.pickups = [];
    state.obstacleGrid.rebuild([]);
    const centerX = state.viewport.x;
    const centerY = state.viewport.y;
    state.hierarchicalNavigator.initialize(centerX, centerY);
    state.worldSurfaces.clear();
    state.worldSurfaces.clearBakeCache();
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
    getRoguelikeMapSession(state).selectedNodeId = null;
    sandboxController?.clearBodies();
    state.groundZones = [];
}
/**
 * @param {import("../state.js").TileLabGameState} state
 * @param {{ mapSeed: number, floorSeed: number }} seeds
 */
export function generateTilelabMap(state, { mapSeed, floorSeed }) {
    regenerateRoguelikeMap(state, { mapSeed, floorSeed, generateWorld: (s) => engine.worldGen.generateWorld(s) });
    sandboxController?.clearBodies();
    const bounds = state.obstacleGrid;
    if (bounds.minX !== undefined) state.viewport.snapTo((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    state.groundZones = [];
    spawnSandboxBattleGroups(state);
}
/** @param {import("../state.js").TileLabGameState} state @param {number} nodeId */
export function focusLabNode(state, nodeId) {
    state.roguelikeMapSession.selectedNodeId = nodeId;
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) return;
    const worldCoords = state.getNodeWorldCoords(node);
    const worldGen = engine.worldGen;
    const startNodeId = worldGen.startMapNodeId;
    if (nodeId === startNodeId) {
        const layout = worldGen.getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
        state.viewport.snapTo(layout.spawnX, layout.spawnY);
    } else state.viewport.snapTo(worldCoords.x, worldCoords.y);
}
