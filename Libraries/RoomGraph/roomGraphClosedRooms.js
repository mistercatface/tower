import { gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";

/** @typedef {{ c: number, r: number }} Cell */
/** @typedef {{ id: number, c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number, width: number, height: number }} GraphNode */
/** @typedef {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }} RailWall */
/** @typedef {{ c: number, r: number, side: number }} RoomWallHole */
/** @typedef {{ node: GraphNode, gaps: Set<string>, holes: RoomWallHole[] }} ClosedRoom */

/** @param {number} c @param {number} r @param {number} side */
export function roomWallEdgeKey(c, r, side) {
    return `${c},${r},${side}`;
}

/** @param {{ nodes: GraphNode[] }} nodeGraph */
export function buildRoomsFromNodeGraph(nodeGraph) {
    return nodeGraph.nodes.map((node) => ({ node, gaps: new Set(), holes: [] }));
}

/** @param {GraphNode} node @param {number} originCol @param {number} originRow @param {Set<string>} [gaps] */
export function railWallsForClosedRect(node, originCol, originRow, gaps = new Set()) {
    /** @type {RailWall[]} */
    const walls = [];
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => {
        if (gaps.has(roomWallEdgeKey(c, r, side))) return;
        walls.push({ col: c + originCol, row: r + originRow, side, heightLevel: 1, thicknessLevel: 1 });
    };
    for (let c = node.c0; c <= node.c1; c++) {
        push(c, node.r0, 0);
        push(c, node.r1, 2);
    }
    for (let r = node.r0; r <= node.r1; r++) {
        push(node.c0, r, 3);
        push(node.c1, r, 1);
    }
    return walls;
}

/** @param {ClosedRoom} closedRoom @param {number} originCol @param {number} originRow */
export function railWallsForClosedRoom(closedRoom, originCol, originRow) {
    return railWallsForClosedRect(closedRoom.node, originCol, originRow, closedRoom.gaps);
}

/** @param {ClosedRoom[]} closedRooms @param {number} originCol @param {number} originRow */
export function railWallsForClosedRooms(closedRooms, originCol, originRow) {
    /** @type {RailWall[]} */
    const walls = [];
    for (let i = 0; i < closedRooms.length; i++) walls.push(...railWallsForClosedRoom(closedRooms[i], originCol, originRow));
    return walls;
}

/** @param {number} c @param {number} r @param {number} side @param {number} originCol @param {number} originRow */
function roomWallGapKeyWorld(c, r, side, originCol, originRow) {
    return `${c + originCol},${r + originRow},${side}`;
}

/** @param {RoomWallHole} hole @param {number} originCol @param {number} originRow */
function roomWallGapKeysWorldForHole(hole, originCol, originRow) {
    const neighbor = gridSideNeighborCell(hole.c, hole.r, hole.side);
    return [roomWallGapKeyWorld(hole.c, hole.r, hole.side, originCol, originRow), roomWallGapKeyWorld(neighbor.col, neighbor.row, (hole.side + 2) % 4, originCol, originRow)];
}

/** @param {ClosedRoom[]} closedRooms @param {number} originCol @param {number} originRow */
export function roomWallGapKeysWorld(closedRooms, originCol, originRow) {
    /** @type {Set<string>} */
    const keys = new Set();
    for (let i = 0; i < closedRooms.length; i++) {
        const holes = closedRooms[i].holes;
        for (let j = 0; j < holes.length; j++) {
            const pair = roomWallGapKeysWorldForHole(holes[j], originCol, originRow);
            keys.add(pair[0]);
            keys.add(pair[1]);
        }
    }
    return keys;
}

/** @param {RailWall[]} railWalls @param {Set<string>} gapKeysWorld */
export function omitRailWallsAtGapKeys(railWalls, gapKeysWorld) {
    return railWalls.filter((w) => !gapKeysWorld.has(`${w.col},${w.row},${w.side}`));
}

/** @param {RailWall[][]} lists */
export function mergeRailWalls(lists) {
    /** @type {Set<string>} */
    const seen = new Set();
    /** @type {RailWall[]} */
    const out = [];
    for (let i = 0; i < lists.length; i++) {
        const list = lists[i];
        for (let j = 0; j < list.length; j++) {
            const w = list[j];
            const key = `${w.col},${w.row},${w.side}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(w);
        }
    }
    return out;
}

/** @param {ClosedRoom} closedRoom @param {RoomWallHole[][]} holeGroups */
export function applyCorridorHoleGroups(closedRoom, holeGroups) {
    for (let lane = 0; lane < holeGroups.length; lane++) {
        const group = holeGroups[lane];
        for (let i = 0; i < group.length; i++) {
            const hole = group[i];
            closedRoom.gaps.add(roomWallEdgeKey(hole.c, hole.r, hole.side));
            closedRoom.holes.push(hole);
        }
    }
}

/** @param {ClosedRoom} roomA @param {ClosedRoom} roomB @param {RoomWallHole[][]} parentHoleGroups @param {RoomWallHole[][]} childHoleGroups */
export function applyCorridorHoleGroupsToRooms(roomA, roomB, parentHoleGroups, childHoleGroups) {
    applyCorridorHoleGroups(roomA, parentHoleGroups);
    applyCorridorHoleGroups(roomB, childHoleGroups);
}
