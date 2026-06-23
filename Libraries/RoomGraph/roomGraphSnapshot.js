import { cellToGlobalColRow } from "../Spatial/grid/gridCellTopology.js";
import { cloneRoomGraphDoc, replaceRoomGraph } from "./roomGraphStore.js";
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function collectRoomGraphForSnapshot(state, grid) {
    const graph = cloneRoomGraphDoc(state);
    const nodes = graph.nodes.map((node) => {
        const { globalCol, globalRow } = cellToGlobalColRow(grid, node.col, node.row);
        return { ...node, col: globalCol, row: globalRow };
    });
    return { nodes, links: graph.links, nextNodeId: graph.nextNodeId, nextLinkId: graph.nextLinkId };
}
/** @param {object} state @param {ReturnType<typeof collectRoomGraphForSnapshot>} roomGraph @param {number} cellSize */
export function applyRoomGraphFromSnapshot(state, roomGraph, cellSize) {
    const grid = state.obstacleGrid;
    const half = cellSize * 0.5;
    const nodes = roomGraph.nodes.map((node) => {
        const col = grid.worldCol(node.col * cellSize + half);
    const row = grid.worldRow(node.row * cellSize + half);
        return { ...node, col, row };
    });
    replaceRoomGraph(state, { ...roomGraph, nodes });
}
