import { gridSettings } from "../../../Config/Config.js";
import { generateWorld, getWorldGen } from "../../../Core/GamePorts.js";
import { buildGameMapRenderCaches, buildTopologyMapRenderCaches } from "../../../Libraries/Render/map/MapRenderCache.js";
import { withSeededRandom } from "../../../Libraries/Random/index.js";
import { calculatePathTest, resetPathTestPositions } from "./mapPathTest.js";
export const mapGenCanvasBounds = { width: gridSettings.width, height: gridSettings.height };
export function populateNodeSelect(state) {
    const select = document.getElementById("mapNodeSelect");
    if (!select || !state) return;
    const prev = Number(select.value) || 0;
    select.innerHTML = "";
    for (const node of listLabMapNodes(state)) {
        const opt = document.createElement("option");
        opt.value = String(node.id);
        opt.textContent = `${node.id}·L${node.layer}`;
        select.appendChild(opt);
    }
    select.value = state.getMapNode(prev) ? String(prev) : "0";
}
export function listLabMapNodes(state) {
    return state.mapNodes.map((n) => ({ id: n.id, layer: n.layer, strategy: n.strategy ?? "?" })).sort((a, b) => a.layer - b.layer || a.id - b.id);
}
/**
 * @param {import("../TileLabGameState.js").TileLabGameState} state
 * @param {{ mapSeed: number, floorSeed: number }} seeds
 */
export function generateTilelabMap(state, { mapSeed, floorSeed }) {
    state.canvasBounds = { ...mapGenCanvasBounds };
    withSeededRandom(mapSeed, () => {
        generateWorld(state);
    });
    buildGameMapRenderCaches(state);
    buildTopologyMapRenderCaches(state);
    state.worldSurfaceSeed = floorSeed;
    state.worldSurfaces.clear();
    state.mapSeed = mapSeed;
    state.floorSeed = floorSeed;
    state.mapLab.selectedNodeId = null;
    const bounds = state.obstacleGrid;
    if (bounds?.minX !== undefined) state.mapViewport.snapTo((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2);
    resetPathTestPositions(state);
    calculatePathTest(state);
    focusLabNode(state, Number(document.getElementById("mapNodeSelect")?.value) || 0);
    populateNodeSelect(state);
}

/** @param {import("../TileLabGameState.js").TileLabGameState} state */
export function focusLabNode(state, nodeId) {
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
