import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { clearRailWallAt, stampRailWallAt } from "../Sandbox/gridWallEdit.js";
import { notifyGridWallChange } from "../Sandbox/boundaryEdit.js";
import {
    buildRoomsFromNodeGraph,
    createSeededRng,
    mergeRailWalls,
    omitRailWallsAtGapKeys,
    railWallsForClosedRooms,
    roomWallGapKeysWorld,
    socketSideToward,
    travelFromSocketSide,
    tryBuildCorridorForEdge,
} from "../Sandbox/sandboxRoomGraphGen.js";
import { getRoomGraph, listRoomLinks, listRoomNodes } from "./roomGraphStore.js";
/** @typedef {{ col: number, row: number, side: number, heightLevel?: number, thicknessLevel?: number }} BakedRail */
/** @typedef {{ id: number, c0: number, c1: number, r0: number, r1: number, centerC: number, centerR: number, width: number, height: number }} AuthoredGraphNode */
/** @param {import("./roomGraphStore.js").RoomNode} node */
function roomNodeToGraphNode(node) {
    const c0 = node.col;
    const r0 = node.row;
    const c1 = node.col + node.width - 1;
    const r1 = node.row + node.height - 1;
    return { id: node.id, c0, c1, r0, r1, centerC: (c0 + (node.width - 1) / 2) | 0, centerR: (r0 + (node.height - 1) / 2) | 0, width: node.width, height: node.height };
}
/** @param {object} state */
function buildAuthoredBakeLayout(state) {
    const roomNodes = listRoomNodes(state);
    const links = listRoomLinks(state);
    const grid = state.obstacleGrid;
    /** @type {Map<number, number>} */
    const idToIndex = new Map();
    /** @type {AuthoredGraphNode[]} */
    const graphNodes = [];
    for (let i = 0; i < roomNodes.length; i++) {
        idToIndex.set(roomNodes[i].id, i);
        graphNodes.push(roomNodeToGraphNode(roomNodes[i]));
    }
    /** @type {{ a: number, b: number, linkId: number }[]} */
    const graphEdges = [];
    for (let i = 0; i < links.length; i++) {
        const link = links[i];
        const a = idToIndex.get(link.a);
        const b = idToIndex.get(link.b);
        if (a == null || b == null) continue;
        graphEdges.push({ a, b, linkId: link.id });
    }
    const nodeGraph = {
        nodes: graphNodes,
        directedEdges: graphEdges.map(({ a, b }) => {
            const parent = graphNodes[a];
            const child = graphNodes[b];
            return { a, b, travel: travelFromSocketSide(socketSideToward(parent, child)), parentSocket: socketSideToward(parent, child), childSocket: socketSideToward(child, parent) };
        }),
    };
    const closedRooms = buildRoomsFromNodeGraph(nodeGraph);
    return { rooms: graphNodes, graphEdges, closedRooms, gridCols: grid.cols, gridRows: grid.rows, links, nodeGraph };
}
/** @param {object} state */
function listBakedRails(state) {
    return getRoomGraph(state).bakedRails ?? [];
}
/** @param {object} state @param {BakedRail[]} rails */
function setBakedRails(state, rails) {
    getRoomGraph(state).bakedRails = rails;
}
/** @param {object} state */
export function unbakeRoomGraph(state) {
    const rails = listBakedRails(state);
    if (!rails.length) return;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (let i = 0; i < rails.length; i++) {
        const { col, row, side } = rails[i];
        clearRailWallAt(state, col, row, side);
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    }
    setBakedRails(state, []);
    if (minCol !== Infinity) notifyGridWallChange(state, { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });
}
/** @param {AuthoredGraphNode[]} graphNodes */
function expandGridForGraphNodes(state, graphNodes) {
    const grid = state.obstacleGrid;
    const cellSize = grid.cellSize;
    const half = cellSize * 0.5;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < graphNodes.length; i++) {
        const node = graphNodes[i];
        const c0 = grid.gridToWorld(node.c0, node.r0);
        const c1 = grid.gridToWorld(node.c1, node.r1);
        minX = Math.min(minX, c0.x - half, c1.x - half);
        minY = Math.min(minY, c0.y - half, c1.y - half);
        maxX = Math.max(maxX, c0.x + half, c1.x + half);
        maxY = Math.max(maxY, c0.y + half, c1.y + half);
    }
    if (Number.isFinite(minX)) state.obstacleGrid.expandToCoverAabb({ minX, minY, maxX, maxY });
}
/** @param {object} state @param {ReturnType<typeof buildAuthoredBakeLayout>} layout @returns {BakedRail[]} */
function computeRoomGraphRailWalls(state, layout) {
    const originCol = 0;
    const originRow = 0;
    const { rooms, graphEdges, closedRooms, links, gridCols, gridRows } = layout;
    if (!rooms.length) return [];
    /** @type {import("../Sandbox/sandboxRoomGraphGen.js").Cell[][]} */
    const placedPaths = [];
    /** @type {import("../Sandbox/sandboxRoomGraphGen.js").RailWall[][]} */
    const corridorRailLists = [];
    const layoutForEdge = { rooms, graphEdges: layout.nodeGraph.directedEdges, gridCols, gridRows, closedRooms };
    for (let edgeIndex = 0; edgeIndex < graphEdges.length; edgeIndex++) {
        const link = links.find((entry) => entry.id === graphEdges[edgeIndex].linkId);
        if (!link) continue;
        const rng = createSeededRng(link.seed ?? link.id * 9973);
        const corridorCount = link.corridorCount ?? 2;
        const corridorWidth = link.corridorWidth ?? 2;
        const canIntersect = link.canIntersect === true;
        const result = tryBuildCorridorForEdge(edgeIndex, layoutForEdge, closedRooms, rng, originCol, originRow, {
            corridorCount,
            corridorWidth,
            canIntersect,
            existingPaths: canIntersect ? [] : placedPaths,
            skipPunchIfHolesPresent: false,
        });
        if (!result) continue;
        for (let pi = 0; pi < result.paths.length; pi++) placedPaths.push(result.paths[pi]);
        corridorRailLists.push(result.railWalls);
    }
    const roomRails = railWallsForClosedRooms(closedRooms, originCol, originRow);
    const gapKeys = roomWallGapKeysWorld(closedRooms, originCol, originRow);
    const corridorRails = corridorRailLists.length ? omitRailWallsAtGapKeys(mergeRailWalls(corridorRailLists), gapKeys) : [];
    return mergeRailWalls([roomRails, corridorRails]);
}
/** @param {object} state @param {BakedRail[]} railWalls */
function stampRoomGraphRailWalls(state, railWalls) {
    const grid = state.obstacleGrid;
    /** @type {BakedRail[]} */
    const stamped = [];
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (let i = 0; i < railWalls.length; i++) {
        const wall = railWalls[i];
        if (!cellInRect(wall.col, wall.row, grid.cols, grid.rows)) continue;
        const heightLevel = wall.heightLevel ?? 1;
        const thicknessLevel = wall.thicknessLevel ?? 1;
        if (!stampRailWallAt(state, wall.col, wall.row, wall.side, heightLevel, thicknessLevel)) continue;
        stamped.push({ col: wall.col, row: wall.row, side: wall.side, heightLevel, thicknessLevel });
        if (wall.col < minCol) minCol = wall.col;
        if (wall.col > maxCol) maxCol = wall.col;
        if (wall.row < minRow) minRow = wall.row;
        if (wall.row > maxRow) maxRow = wall.row;
    }
    setBakedRails(state, stamped);
    if (minCol !== Infinity) notifyGridWallChange(state, { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow });
}
/** Rebuild all room-graph-owned rail walls from `state.roomGraph`. */
export function syncRoomGraphBake(state) {
    unbakeRoomGraph(state);
    let layout = buildAuthoredBakeLayout(state);
    if (!layout.rooms.length) return;
    expandGridForGraphNodes(state, layout.rooms);
    layout = buildAuthoredBakeLayout(state);
    stampRoomGraphRailWalls(state, computeRoomGraphRailWalls(state, layout));
}
/** @param {object} state @param {number} linkId */
export function rerollRoomLinkBake(state, linkId) {
    const links = listRoomLinks(state);
    for (let i = 0; i < links.length; i++) {
        if (links[i].id !== linkId) continue;
        links[i].seed = (Math.random() * 0xffffffff) | 0;
        syncRoomGraphBake(state);
        return;
    }
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} width @param {number} height */
export function expandGridForRoomNodeFootprint(state, anchorCol, anchorRow, width, height) {
    const grid = state.obstacleGrid;
    const half = grid.cellSize * 0.5;
    const c0 = grid.gridToWorld(anchorCol, anchorRow);
    const c1 = grid.gridToWorld(anchorCol + width - 1, anchorRow + height - 1);
    grid.expandToCoverAabb({ minX: c0.x - half, minY: c0.y - half, maxX: c1.x + half, maxY: c1.y + half });
}
