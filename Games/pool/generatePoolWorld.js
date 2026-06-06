import { gridSettings } from "../../Config/Config.js";
import { finalizeGeneratedWorld } from "../../Libraries/WorldGen/finalizeGeneratedWorld.js";
import { buildPoolStartLayout } from "./config/tableLayout.js";
import { poolSurfaceProfileId } from "./config/proceduralDesign.js";
import { generatePoolTable } from "./PoolTableStrategy.js";
/** Single-node arena — no roguelike map graph or cellular-automata backdrop. */
export function generatePoolWorld(state) {
    state.mapBaseSpawnX = state.canvasBounds.width > 0 ? state.canvasBounds.width / 2 : 225;
    state.mapBaseSpawnY = state.canvasBounds.height > 0 ? state.canvasBounds.height / 2 : 225;
    state.mapNodes = [{ id: 0, x: 0, y: 0, connections: [], layer: 0 }];
    state.rebuildMapNodeIndex();
    state.currentNodeId = 0;
    state.walls = [];
    state.wallSpatialIndex.clear();
    const { x: px, y: py } = state.getMapSpawnOrigin();
    generatePoolTable(state, px, py);
    for (const wall of state.walls) state.wallSpatialIndex.insert(wall);
    const startNode = state.getMapNode(0);
    if (startNode) {
        startNode.strategy = "PoolTable";
        startNode.surfaceProfileId = poolSurfaceProfileId;
    }
    const layout = buildPoolStartLayout(px, py, gridSettings.cellSize);
    finalizeGeneratedWorld(state, { centerX: layout.tableCenterX, centerY: layout.tableCenterY });
}
