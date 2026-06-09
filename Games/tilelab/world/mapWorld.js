import { gridSettings } from "../../../Config/Config.js";
import { generateWorld, getWorldGen } from "../../../Core/GamePorts.js";
import { regenerateRoguelikeMap } from "../../../Libraries/WorldGen/session/index.js";
import { syncLabScreenCanvasBounds } from "../ui/labCanvas.js";
import { clearTilelabSandbox } from "./tilelabSandbox.js";
import { spawnSandboxBattleGroups } from "./sandboxBattleSpawn.js";
export function listLabMapNodes(state) {
    return state.mapNodes.map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" })).sort((a, b) => a.layer - b.layer || a.id - b.id);
}
/** @param {import("../index.js").TileLabGameState} state @param {number | null} nodeId */
export function selectLabNode(state, nodeId) {
    state.roguelikeMapSession.selectedNodeId = nodeId;
}
/**
 * @param {import("../index.js").TileLabGameState} state
 * @param {{ mapSeed: number, floorSeed: number }} seeds
 */
export function generateTilelabMap(state, { mapSeed, floorSeed }) {
    regenerateRoguelikeMap(state, { mapSeed, floorSeed, generateWorld });
    clearTilelabSandbox();
    syncLabScreenCanvasBounds(state);
    const bounds = state.obstacleGrid;
    if (bounds?.minX !== undefined) state.mapViewport.snapTo((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    spawnSandboxBattleGroups(state);
}
/** @param {import("../index.js").TileLabGameState} state */
export function focusLabNode(state, nodeId) {
    selectLabNode(state, nodeId);
    state.currentNodeId = nodeId;
    const node = state.getMapNode(nodeId);
    if (!node) return;
    const worldCoords = state.getNodeWorldCoords(node);
    const startNodeId = getWorldGen().startMapNodeId ?? 0;
    if (nodeId === startNodeId) {
        const layout = getWorldGen().getStartLayout(worldCoords.x, worldCoords.y, gridSettings.cellSize);
        state.mapViewport.snapTo(layout.spawnX, layout.spawnY);
    } else state.mapViewport.snapTo(worldCoords.x, worldCoords.y);
}
