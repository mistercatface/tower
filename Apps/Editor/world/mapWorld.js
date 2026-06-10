import { gridSettings } from "../../../Config/Config.js";
import { generateWorld } from "../../../Core/GamePorts.js";
import { editorGame } from "../index.js";
import { buildGameMapRenderCaches, buildTopologyMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { getRoguelikeMapSession, regenerateRoguelikeMap } from "../../../Libraries/WorldGen/session/index.js";
import { clearTilelabSandbox } from "./tilelabSandbox.js";
import { resetTilelabGroundZones } from "../groundZones.js";
import { spawnSandboxBattleGroups } from "./sandboxBattleSpawn.js";
export function listLabMapNodes(state) {
    return state.mapNodes.map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" })).sort((a, b) => a.layer - b.layer || a.id - b.id);
}
/** @param {import("../index.js").TileLabGameState} state @param {number | null} nodeId */
export function selectLabNode(state, nodeId) {
    state.roguelikeMapSession.selectedNodeId = nodeId;
}
/** @param {import("../index.js").TileLabGameState} state */
export function initEmptyTilelabMap(state) {
    const viewW = state.viewport?.width ?? 0;
    const viewH = state.viewport?.height ?? 0;
    state.mapBaseSpawnX = viewW > 0 ? viewW / 2 : 225;
    state.mapBaseSpawnY = viewH > 0 ? viewH / 2 : 225;
    state.walls = [];
    state.wallSpatialIndex.clear();
    state.mapNodes = [];
    state.mapNodeById.clear();
    state.currentNodeId = 0;
    state.pickups = [];
    state.obstacleGrid.rebuild([]);
    const centerX = state.viewport?.x ?? 0;
    const centerY = state.viewport?.y ?? 0;
    state.hierarchicalNavigator.initialize(centerX, centerY);
    state.worldSurfaces.clear();
    state.worldSurfaces.clearBakeCache();
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
    getRoguelikeMapSession(state).selectedNodeId = null;
    clearTilelabSandbox();
    resetTilelabGroundZones(state);
}
/**
 * @param {import("../index.js").TileLabGameState} state
 * @param {{ mapSeed: number, floorSeed: number }} seeds
 */
export function generateTilelabMap(state, { mapSeed, floorSeed }) {
    regenerateRoguelikeMap(state, { mapSeed, floorSeed, generateWorld });
    clearTilelabSandbox();
    const bounds = state.obstacleGrid;
    if (bounds?.minX !== undefined) state.viewport.snapTo((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    resetTilelabGroundZones(state);
    spawnSandboxBattleGroups(state);
}
/** @param {import("../index.js").TileLabGameState} state */
export function focusLabNode(state, nodeId) {
    selectLabNode(state, nodeId);
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) return;
    const worldCoords = state.getNodeWorldCoords(node);
    const worldGen = editorGame.worldGen;
    const startNodeId = worldGen.startMapNodeId ?? 0;
    if (nodeId === startNodeId) {
        const layout = worldGen.getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
        state.viewport.snapTo(layout.spawnX, layout.spawnY);
    } else state.viewport.snapTo(worldCoords.x, worldCoords.y);
}
