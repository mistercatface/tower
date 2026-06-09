import { gridSettings } from "../../Config/Config.js";
import { FLOW_FIELD_WORKER_URL } from "../../Render/WorldSurfaceBootstrap.js";
import { FlowFieldGrid } from "../../Libraries/Pathfinding/FlowFieldGrid.js";
import { WorldObstacleGrid } from "../../Libraries/Spatial/grid/WorldObstacleGrid.js";
let tempObstacleGrid = null;
let tempFlowFieldGrid = null;
export function getWorldGenTempGrids() {
    if (!tempObstacleGrid) {
        tempObstacleGrid = new WorldObstacleGrid(gridSettings.cellSize);
        tempFlowFieldGrid = new FlowFieldGrid(gridSettings.cellSize, gridSettings.width, gridSettings.height, tempObstacleGrid, FLOW_FIELD_WORKER_URL);
    }
    return { tempObstacleGrid, tempFlowFieldGrid };
}
/** @param {import("../../Entities/Wall.js").Segment[]} walls */
export function serializeWalls(walls, px, py, maxRadius = 480) {
    const out = [];
    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        const half = w.size / 2;
        const dist = Math.hypot(w.x - px, w.y - py);
        if (dist + half <= maxRadius) out.push({ x: w.x, y: w.y, angle: w.angle, size: w.size, padding: w.padding, maxHealth: w.maxHealth || 30, wallHeight: w.wallHeight });
    }
    return out;
}
/** @param {object[]} mapNodes */
export function buildIncomingNodesMap(mapNodes) {
    const incomingByNodeId = new Map();
    for (const node of mapNodes)
        for (const targetId of node.connections) {
            let incoming = incomingByNodeId.get(targetId);
            if (!incoming) {
                incoming = [];
                incomingByNodeId.set(targetId, incoming);
            }
            incoming.push(node);
        }
    return incomingByNodeId;
}
export function checkNodePathability(state, nodeA, nodeB, wallsA, wallsB, tempObstacleGrid, tempFlowFieldGrid) {
    const coordsA = state.getNodeWorldCoords(nodeA);
    const coordsB = state.getNodeWorldCoords(nodeB);
    const mx = (coordsA.x + coordsB.x) / 2;
    const my = (coordsA.y + coordsB.y) / 2;
    tempFlowFieldGrid.centerX = mx;
    tempFlowFieldGrid.centerY = my;
    tempObstacleGrid.rebuildFixed(mx, my, gridSettings.width, gridSettings.height);
    const localWalls = state.wallSpatialIndex.collectInBounds(mx - gridSettings.width / 2, my - gridSettings.height / 2, mx + gridSettings.width / 2, my + gridSettings.height / 2);
    for (let i = 0; i < localWalls.length; i++) tempObstacleGrid.markWall(localWalls[i]);
    for (let i = 0; i < wallsA.length; i++) tempObstacleGrid.markWall(wallsA[i]);
    for (let i = 0; i < wallsB.length; i++) tempObstacleGrid.markWall(wallsB[i]);
    tempFlowFieldGrid.syncLocalObstacles();
    return tempFlowFieldGrid.checkReachability(coordsA.x, coordsA.y, coordsB.x, coordsB.y);
}
