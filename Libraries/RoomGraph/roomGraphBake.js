import { commitBoundaryEdit } from "../Sandbox/boundaryEdit.js";
import { clearRailWallsQuiet, stampRailWallsQuiet } from "../Sandbox/gridWallEdit.js";
import { createSeededRng } from "../Math/SeededRng.js";
import { buildRoomsFromNodeGraph, mergeRailWalls, omitRailWallsAtGapKeys, railWallsForClosedRooms, roomWallGapKeysWorld } from "./roomGraphClosedRooms.js";
import { getRoomGraph, listRoomLinks, listRoomNodes } from "./roomGraphStore.js";
import { resolveLinkCorridorRoll } from "./roomGraphLinkCorridor.js";
import { normalizeCorridorType, isConveyorCorridorType } from "./roomGraphCorridorTypes.js";
import { clearBakedFloorBeltsQuiet, stampBakedFloorBeltsQuiet } from "./roomGraphFloorBelts.js";
import { applyCorridorBundleToRooms, solveAuthoredLinkCorridorBundle, stampCorridorBundleBelts, stampCorridorBundleRails } from "./roomGraphCorridorApply.js";
/** @typedef {{ col: number, row: number, side: number, heightLevel?: number, thicknessLevel?: number }} BakedRail */
/** @typedef {{ id: number, c0: number, c1: number, r0: number, r1: number, centerC: number, centerR: number, width: number, height: number }} AuthoredGraphNode */
/** @typedef {{ startCol: number, endCol: number, startRow: number, endRow: number }} CellBounds */
/** @param {CellBounds | null} a @param {CellBounds | null} b @returns {CellBounds | null} */
function unionCellBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { startCol: Math.min(a.startCol, b.startCol), endCol: Math.max(a.endCol, b.endCol), startRow: Math.min(a.startRow, b.startRow), endRow: Math.max(a.endRow, b.endRow) };
}
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
    const closedRooms = buildRoomsFromNodeGraph({ nodes: graphNodes, directedEdges: [] });
    /** @type {Map<number, import("./roomGraphStore.js").RoomNode>} */
    const roomNodeById = new Map();
    for (let i = 0; i < roomNodes.length; i++) roomNodeById.set(roomNodes[i].id, roomNodes[i]);
    return { rooms: graphNodes, graphEdges, closedRooms, gridCols: grid.cols, gridRows: grid.rows, links, roomNodeById };
}
function listBakedFloorBelts(state) {
    return getRoomGraph(state).bakedFloorBelts ?? [];
}

/** @param {object} state @param {import("./roomGraphFloorBelts.js").BakedFloorBelt[]} belts */
function setBakedFloorBelts(state, belts) {
    getRoomGraph(state).bakedFloorBelts = belts;
}

/** @param {object} state */
function listBakedRails(state) {
    return getRoomGraph(state).bakedRails ?? [];
}
/** @param {object} state @param {BakedRail[]} rails */
function setBakedRails(state, rails) {
    getRoomGraph(state).bakedRails = rails;
}
/** @param {AuthoredGraphNode[]} graphNodes */
function expandGridForGraphNodes(state, graphNodes) {
    const grid = state.obstacleGrid;
    const half = grid.cellSize * 0.5;
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
/** @param {import("./roomGraphClosedRooms.js").ClosedRoom} closedRoom */
function snapshotClosedRoomState(closedRoom) {
    return { gaps: new Set(closedRoom.gaps), holes: closedRoom.holes.slice() };
}
/** @param {import("./roomGraphClosedRooms.js").ClosedRoom} closedRoom @param {{ gaps: Set<string>, holes: import("./roomGraphClosedRooms.js").RoomWallHole[] }} snap */
function restoreClosedRoomState(closedRoom, snap) {
    closedRoom.gaps = new Set(snap.gaps);
    closedRoom.holes = snap.holes.slice();
}
/** @param {ReturnType<typeof buildAuthoredBakeLayout>} layout @returns {{ rails: BakedRail[], belts: import("./roomGraphFloorBelts.js").BakedFloorBelt[] }} */
function computeRoomGraphBake(layout) {
    const originCol = 0;
    const originRow = 0;
    const { rooms, graphEdges, closedRooms, links } = layout;
    if (!rooms.length) return { rails: [], belts: [] };
    /** @type {Map<number, import("./roomGraphStore.js").RoomLink>} */
    const linkById = new Map();
    for (let i = 0; i < links.length; i++) linkById.set(links[i].id, links[i]);
    /** @type {import("./roomGraphClosedRooms.js").Cell[][]} */
    const placedPaths = [];
    /** @type {number[]} */
    const placedPathWidths = [];
    /** @type {import("./roomGraphClosedRooms.js").RailWall[][]} */
    const corridorRailLists = [];
    /** @type {import("./roomGraphFloorBelts.js").BakedFloorBelt[]} */
    const bakedBelts = [];
    for (let edgeIndex = 0; edgeIndex < graphEdges.length; edgeIndex++) {
        const { a, b, linkId } = graphEdges[edgeIndex];
        const link = linkById.get(linkId);
        if (!link) continue;
        const corridorType = normalizeCorridorType(link.corridorType);
        const roomA = closedRooms[a];
        const roomB = closedRooms[b];
        const snapA = snapshotClosedRoomState(roomA);
        const snapB = snapshotClosedRoomState(roomB);
        const nodeA = layout.roomNodeById.get(link.a);
        const nodeB = layout.roomNodeById.get(link.b);
        const rng = createSeededRng(link.seed ?? link.id * 9973);
        const { corridorWidths } = resolveLinkCorridorRoll(link, nodeA, nodeB, rng);
        const canIntersect = link.canIntersect === true;
        const bundle = solveAuthoredLinkCorridorBundle(rooms[a], rooms[b], rooms, corridorWidths, rng, {
            canIntersect,
            existingPaths: canIntersect ? [] : placedPaths,
            existingPathWidths: canIntersect ? [] : placedPathWidths,
        });
        if (!bundle) {
            restoreClosedRoomState(roomA, snapA);
            restoreClosedRoomState(roomB, snapB);
            continue;
        }
        applyCorridorBundleToRooms(bundle, roomA, roomB);
        for (let pi = 0; pi < bundle.paths.length; pi++) {
            placedPaths.push(bundle.paths[pi]);
            placedPathWidths.push(bundle.corridorWidths[pi]);
        }
        if (isConveyorCorridorType(corridorType)) bakedBelts.push(...stampCorridorBundleBelts(bundle, rooms, corridorType));
        else corridorRailLists.push(stampCorridorBundleRails(bundle, rooms, closedRooms, originCol, originRow));
    }
    const roomRails = railWallsForClosedRooms(closedRooms, originCol, originRow);
    const gapKeys = roomWallGapKeysWorld(closedRooms, originCol, originRow);
    const corridorRails = corridorRailLists.length ? omitRailWallsAtGapKeys(mergeRailWalls(corridorRailLists), gapKeys) : [];
    return { rails: mergeRailWalls([roomRails, corridorRails]), belts: bakedBelts };
}
/** Rebuild all room-graph-owned rail walls from `state.roomGraph`. */
export function syncRoomGraphBake(state) {
    let dirtyBounds = clearRailWallsQuiet(state, listBakedRails(state));
    dirtyBounds = unionCellBounds(dirtyBounds, clearBakedFloorBeltsQuiet(state, listBakedFloorBelts(state)));
    setBakedRails(state, []);
    setBakedFloorBelts(state, []);
    let layout = buildAuthoredBakeLayout(state);
    if (!layout.rooms.length) {
        if (dirtyBounds) commitBoundaryEdit(state, dirtyBounds);
        return;
    }
    expandGridForGraphNodes(state, layout.rooms);
    layout = buildAuthoredBakeLayout(state);
    const bake = computeRoomGraphBake(layout);
    const { bounds: railBounds, stamped: stampedRails } = stampRailWallsQuiet(state, bake.rails);
    const { bounds: beltBounds, stamped: stampedBelts } = stampBakedFloorBeltsQuiet(state, bake.belts);
    setBakedRails(state, stampedRails);
    setBakedFloorBelts(state, stampedBelts);
    dirtyBounds = unionCellBounds(dirtyBounds, railBounds);
    dirtyBounds = unionCellBounds(dirtyBounds, beltBounds);
    if (dirtyBounds) commitBoundaryEdit(state, dirtyBounds);
}
/** @param {object} state */
export function unbakeRoomGraph(state) {
    let bounds = clearRailWallsQuiet(state, listBakedRails(state));
    bounds = unionCellBounds(bounds, clearBakedFloorBeltsQuiet(state, listBakedFloorBelts(state)));
    setBakedRails(state, []);
    setBakedFloorBelts(state, []);
    if (bounds) commitBoundaryEdit(state, bounds);
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
