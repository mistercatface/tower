import { gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";

const SANDBOX_SCENE_SCHEMA_VERSION = 7;

/** @typedef {{ c: number, r: number }} Cell */
/** @typedef {{ id: number, c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number, width: number, height: number }} GraphNode */
/** @typedef {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }} RailWall */
/** @typedef {{ c: number, r: number, side: number }} RoomWallHole */
/** @typedef {{ a: number, b: number, travel: number, parentSocket: number, childSocket: number, parentHole?: RoomWallHole, childHole?: RoomWallHole, corridorFrom?: Cell, corridorTo?: Cell }} DirectedEdge */
/** @typedef {{ node: GraphNode, gaps: Set<string>, holes: RoomWallHole[] }} ClosedRoom */
/**
 * @typedef {{
 *   seed: number,
 *   gridCols: number,
 *   gridRows: number,
 *   nodeCount: number,
 *   minNodes: number,
 *   roomMinWidth: number,
 *   roomMaxWidth: number,
 *   roomMinHeight: number,
 *   roomMaxHeight: number,
 *   nodeSpacingPad: number,
 *   gridEdgeMargin: number,
 *   placementAttemptsPerNode: number,
 *   layoutMaxAttempts: number,
 *   treeParentCandidateCount: number,
 * }} NodeGraphGenConfig
 */
/** @typedef {{ seed: number, config: NodeGraphGenConfig, gridCols: number, gridRows: number, nodes: GraphNode[], treeEdges: { a: number, b: number }[], directedEdges: DirectedEdge[] }} NodeGraph */
/** @typedef {{ seed: number, gridCols: number, gridRows: number, rooms: GraphNode[], treeEdges: { a: number, b: number }[], graphEdges: DirectedEdge[], nodeGraph: NodeGraph, closedRooms: ClosedRoom[] }} RoomGraphLayout */

/** All tunable procgen parameters live here; pass overrides into `resolveNodeGraphGenConfig`. */
export const DEFAULT_NODE_GRAPH_GEN_CONFIG = {
    gridCols: 88,
    gridRows: 64,
    nodeCount: 8,
    minNodes: 4,
    roomMinWidth: 8,
    roomMaxWidth: 13,
    roomMinHeight: 8,
    roomMaxHeight: 13,
    nodeSpacingPad: 4,
    gridEdgeMargin: 3,
    placementAttemptsPerNode: 1200,
    layoutMaxAttempts: 60,
    treeParentCandidateCount: 3,
};

/** @deprecated Use {@link DEFAULT_NODE_GRAPH_GEN_CONFIG}. */
export const DEFAULT_ROOM_GRAPH_GRID = {
    gridCols: DEFAULT_NODE_GRAPH_GEN_CONFIG.gridCols,
    gridRows: DEFAULT_NODE_GRAPH_GEN_CONFIG.gridRows,
    roomCount: DEFAULT_NODE_GRAPH_GEN_CONFIG.nodeCount,
    minRooms: DEFAULT_NODE_GRAPH_GEN_CONFIG.minNodes,
};

export const DEFAULT_CORRIDOR_HALF_WIDTH = 1;
export const DEFAULT_CORRIDOR_EGRESS_CELLS = 2;

const ROOM_PROP_TYPES = ["blue_ball", "beach_ball", "barrel"];

/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number }} [overrides] */
export function resolveNodeGraphGenConfig(overrides = {}) {
    return {
        seed: overrides.seed ?? (Date.now() * 2654435761) >>> 0,
        gridCols: overrides.gridCols ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.gridCols,
        gridRows: overrides.gridRows ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.gridRows,
        nodeCount: overrides.nodeCount ?? overrides.roomCount ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.nodeCount,
        minNodes: overrides.minNodes ?? overrides.minRooms ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.minNodes,
        roomMinWidth: overrides.roomMinWidth ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.roomMinWidth,
        roomMaxWidth: overrides.roomMaxWidth ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.roomMaxWidth,
        roomMinHeight: overrides.roomMinHeight ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.roomMinHeight,
        roomMaxHeight: overrides.roomMaxHeight ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.roomMaxHeight,
        nodeSpacingPad: overrides.nodeSpacingPad ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.nodeSpacingPad,
        gridEdgeMargin: overrides.gridEdgeMargin ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.gridEdgeMargin,
        placementAttemptsPerNode: overrides.placementAttemptsPerNode ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.placementAttemptsPerNode,
        layoutMaxAttempts: overrides.layoutMaxAttempts ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.layoutMaxAttempts,
        treeParentCandidateCount: overrides.treeParentCandidateCount ?? DEFAULT_NODE_GRAPH_GEN_CONFIG.treeParentCandidateCount,
    };
}

/** @param {number} cols @param {number} c @param {number} r */
function cellIdx(cols, c, r) {
    return r * cols + c;
}

/** @param {number} c @param {number} r @param {number} side */
export function roomWallEdgeKey(c, r, side) {
    return `${c},${r},${side}`;
}

/** @param {Cell} cell @param {number} side 0=N,1=E,2=S,3=W */
function stepAcrossSide(cell, side) {
    const n = gridSideNeighborCell(cell.c, cell.r, side);
    return { c: n.col, r: n.row };
}

/** @param {number} c0 @param {number} r0 @param {number} c1 @param {number} r1 */
function manhattanDist(c0, r0, c1, r1) {
    return Math.abs(c0 - c1) + Math.abs(r0 - r1);
}

/** @param {number} min @param {number} max @param {() => number} rng */
function randomIntInclusive(min, max, rng) {
    return min + ((rng() * (max - min + 1)) | 0);
}

/** @param {number} seed */
export function createSeededRng(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** @param {number} gridCols @param {number} gridRows */
export function roomGraphOrigin(gridCols, gridRows) {
    return { originCol: -((gridCols / 2) | 0), originRow: -((gridRows / 2) | 0) };
}

/** Step A — place nodes with width/height; no walls. */
/** @param {() => number} rng @param {NodeGraphGenConfig} config */
export function placeGraphNodes(rng, config) {
    const { gridCols, gridRows, nodeCount, roomMinWidth, roomMaxWidth, roomMinHeight, roomMaxHeight, nodeSpacingPad, gridEdgeMargin, placementAttemptsPerNode } = config;
    /** @type {GraphNode[]} */
    const nodes = [];
    for (let attempt = 0; attempt < placementAttemptsPerNode && nodes.length < nodeCount; attempt++) {
        const width = randomIntInclusive(roomMinWidth, roomMaxWidth, rng);
        const height = randomIntInclusive(roomMinHeight, roomMaxHeight, rng);
        const c0 = gridEdgeMargin + ((rng() * (gridCols - width - gridEdgeMargin * 2)) | 0);
        const r0 = gridEdgeMargin + ((rng() * (gridRows - height - gridEdgeMargin * 2)) | 0);
        const c1 = c0 + width - 1;
        const r1 = r0 + height - 1;
        let ok = true;
        for (let i = 0; i < nodes.length; i++) {
            const o = nodes[i];
            if (c0 - nodeSpacingPad <= o.c1 && c1 + nodeSpacingPad >= o.c0 && r0 - nodeSpacingPad <= o.r1 && r1 + nodeSpacingPad >= o.r0) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;
        nodes.push({
            id: nodes.length,
            c0,
            r0,
            c1,
            r1,
            centerC: ((c0 + c1) / 2) | 0,
            centerR: ((r0 + r1) / 2) | 0,
            width,
            height,
        });
    }
    return nodes;
}

/** @deprecated Use {@link placeGraphNodes}. */
export function placeRooms(rng, cols, rows, count) {
    return placeGraphNodes(rng, resolveNodeGraphGenConfig({ gridCols: cols, gridRows: rows, nodeCount: count }));
}

/** @param {GraphNode[]} nodes @param {() => number} rng @param {number} treeParentCandidateCount */
export function buildBranchingNodeTree(nodes, rng, treeParentCandidateCount = DEFAULT_NODE_GRAPH_GEN_CONFIG.treeParentCandidateCount) {
    const n = nodes.length;
    /** @type {{ a: number, b: number }[]} */
    const edges = [];
    const inTree = new Uint8Array(n);
    inTree[0] = 1;
    for (let k = 1; k < n; k++) {
        /** @type {number[]} */
        const outside = [];
        for (let j = 0; j < n; j++) if (!inTree[j]) outside.push(j);
        const j = outside[(rng() * outside.length) | 0];
        /** @type {{ i: number, d: number }[]} */
        const parents = [];
        for (let i = 0; i < n; i++) {
            if (!inTree[i]) continue;
            parents.push({ i, d: manhattanDist(nodes[i].centerC, nodes[i].centerR, nodes[j].centerC, nodes[j].centerR) });
        }
        parents.sort((a, b) => a.d - b.d);
        const pick = parents[Math.min((rng() * Math.min(treeParentCandidateCount, parents.length)) | 0, parents.length - 1)];
        inTree[j] = 1;
        edges.push({ a: pick.i, b: j });
    }
    return edges;
}

/** @deprecated Use {@link buildBranchingNodeTree}. */
export function buildBranchingRoomTree(rooms, rng) {
    return buildBranchingNodeTree(rooms, rng);
}

/** @param {GraphNode} node @param {{ centerC: number, centerR: number }} target */
export function socketSideToward(node, target) {
    const dx = target.centerC - node.centerC;
    const dy = target.centerR - node.centerR;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
}

/** @param {number} socketSide */
export function travelFromSocketSide(socketSide) {
    if (socketSide === 1) return 0;
    if (socketSide === 2) return 1;
    if (socketSide === 3) return 2;
    return 3;
}

/** Directed tree edges — topology only; wall holes are punched later. */
/** @param {GraphNode[]} nodes @param {{ a: number, b: number }[]} treeEdges */
export function buildDirectedGraphEdges(nodes, treeEdges) {
    /** @type {DirectedEdge[]} */
    const directedEdges = [];
    for (let i = 0; i < treeEdges.length; i++) {
        const { a, b } = treeEdges[i];
        const parent = nodes[a];
        const child = nodes[b];
        directedEdges.push({
            a,
            b,
            travel: travelFromSocketSide(socketSideToward(parent, child)),
            parentSocket: socketSideToward(parent, child),
            childSocket: socketSideToward(child, parent),
        });
    }
    return directedEdges;
}

/** Step A+B — node placement + branching directed graph. No geometry beyond node bounds. */
/** @param {() => number} rng @param {NodeGraphGenConfig} config */
export function buildNodeGraph(rng, config) {
    const nodes = placeGraphNodes(rng, config);
    const treeEdges = buildBranchingNodeTree(nodes, rng, config.treeParentCandidateCount);
    const directedEdges = buildDirectedGraphEdges(nodes, treeEdges);
    return {
        seed: config.seed,
        config,
        gridCols: config.gridCols,
        gridRows: config.gridRows,
        nodes,
        treeEdges,
        directedEdges,
    };
}

/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number, maxAttempts?: number }} [options] */
export function tryBuildNodeGraph(options = {}) {
    const base = resolveNodeGraphGenConfig(options);
    const maxAttempts = options.maxAttempts ?? options.layoutMaxAttempts ?? base.layoutMaxAttempts;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const config = { ...base, seed: base.seed + attempt };
        const rng = createSeededRng(config.seed);
        const nodeGraph = buildNodeGraph(rng, config);
        if (nodeGraph.nodes.length >= config.minNodes) return nodeGraph;
    }
    throw new Error(`Node graph layout failed — could not place ${base.minNodes}+ nodes in ${maxAttempts} attempts`);
}

/** Step B — one closed rail rectangle per node; no holes until `punchHoleInClosedRoom`. */
/** @param {NodeGraph} nodeGraph */
export function buildRoomsFromNodeGraph(nodeGraph) {
    return nodeGraph.nodes.map((node) => ({
        node,
        gaps: new Set(),
        holes: [],
    }));
}

/** @param {GraphNode} node */
export function listClosedRoomWallEdgeSlots(node) {
    /** @type {RoomWallHole[]} */
    const slots = [];
    for (let c = node.c0; c <= node.c1; c++) {
        slots.push({ c, r: node.r0, side: 0 });
        slots.push({ c, r: node.r1, side: 2 });
    }
    for (let r = node.r0; r <= node.r1; r++) {
        slots.push({ c: node.c0, r, side: 3 });
        slots.push({ c: node.c1, r, side: 1 });
    }
    return slots;
}

/** Closed perimeter rail walls for one node rect; `gaps` holds 1-wide omitted edges. */
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
    for (let i = 0; i < closedRooms.length; i++) {
        walls.push(...railWallsForClosedRoom(closedRooms[i], originCol, originRow));
    }
    return walls;
}

/** Punch one random 1-wide hole in a closed room. Call again for a second hole. Mutates `closedRoom`. */
/** @param {ClosedRoom} closedRoom @param {() => number} rng */
export function punchHoleInClosedRoom(closedRoom, rng) {
    const open = listClosedRoomWallEdgeSlots(closedRoom.node).filter((slot) => !closedRoom.gaps.has(roomWallEdgeKey(slot.c, slot.r, slot.side)));
    const hole = open[(rng() * open.length) | 0];
    closedRoom.gaps.add(roomWallEdgeKey(hole.c, hole.r, hole.side));
    closedRoom.holes.push(hole);
    return hole;
}

/** One hole per directed-edge endpoint; wires corridor anchors on the edges. */
/** @param {NodeGraph} nodeGraph @param {ClosedRoom[]} closedRooms @param {() => number} rng */
export function punchHolesForDirectedEdges(nodeGraph, closedRooms, rng) {
    const byId = closedRooms.map((room) => room);
    for (let i = 0; i < nodeGraph.directedEdges.length; i++) {
        const edge = nodeGraph.directedEdges[i];
        edge.parentHole = punchHoleInClosedRoom(byId[edge.a], rng);
        edge.childHole = punchHoleInClosedRoom(byId[edge.b], rng);
        edge.corridorFrom = stepAcrossSide(edge.parentHole, edge.parentHole.side);
        edge.corridorTo = stepAcrossSide(edge.childHole, edge.childHole.side);
    }
}

/** Full layout: node graph + closed rooms. Holes only when `punchHoles` is true. */
/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number, maxAttempts?: number, punchHoles?: boolean, holeRng?: () => number }} [options] */
export function tryBuildRoomGraphLayout(options = {}) {
    const nodeGraph = tryBuildNodeGraph(options);
    const closedRooms = buildRoomsFromNodeGraph(nodeGraph);
    if (options.punchHoles === true) {
        const holeRng = options.holeRng ?? createSeededRng(nodeGraph.seed + 31337);
        punchHolesForDirectedEdges(nodeGraph, closedRooms, holeRng);
    }
    return layoutFromNodeGraph(nodeGraph, closedRooms);
}

/** @param {NodeGraph} nodeGraph @param {ClosedRoom[]} closedRooms */
function layoutFromNodeGraph(nodeGraph, closedRooms) {
    return {
        seed: nodeGraph.seed,
        gridCols: nodeGraph.gridCols,
        gridRows: nodeGraph.gridRows,
        rooms: nodeGraph.nodes,
        treeEdges: nodeGraph.treeEdges,
        graphEdges: nodeGraph.directedEdges,
        nodeGraph,
        closedRooms,
    };
}

/** @deprecated Use {@link tryBuildRoomGraphLayout}. */
export function tryLayoutRoomGraph(options = {}) {
    return tryBuildRoomGraphLayout(options);
}

/** @deprecated Use {@link railWallsForClosedRooms}. */
export function railWallsForRoomOutlines(layout, originCol, originRow) {
    const closedRooms = layout.closedRooms ?? buildRoomsFromNodeGraph(layout.nodeGraph ?? { nodes: layout.rooms, treeEdges: layout.treeEdges, directedEdges: layout.graphEdges, seed: layout.seed, config: resolveNodeGraphGenConfig(), gridCols: layout.gridCols, gridRows: layout.gridRows });
    return railWallsForClosedRooms(closedRooms, originCol, originRow);
}

/** @param {Cell} from @param {Cell} to @param {boolean} horizontalFirst */
function manhattanPath(from, to, horizontalFirst) {
    /** @type {Cell[]} */
    const path = [from];
    let c = from.c;
    let r = from.r;
    if (horizontalFirst) {
        while (c !== to.c) {
            c += c < to.c ? 1 : -1;
            path.push({ c, r });
        }
        while (r !== to.r) {
            r += r < to.r ? 1 : -1;
            path.push({ c, r });
        }
    } else {
        while (r !== to.r) {
            r += r < to.r ? 1 : -1;
            path.push({ c, r });
        }
        while (c !== to.c) {
            c += c < to.c ? 1 : -1;
            path.push({ c, r });
        }
    }
    return path;
}

/** @param {GraphNode[]} nodes @param {number} c @param {number} r */
function cellInsideAnyNode(nodes, c, r) {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (c >= node.c0 && c <= node.c1 && r >= node.r0 && r <= node.r1) return true;
    }
    return false;
}

/** @param {GraphNode[]} nodes @param {Cell[]} path */
function corridorPathIsClear(nodes, path) {
    for (let i = 1; i < path.length - 1; i++) {
        if (cellInsideAnyNode(nodes, path[i].c, path[i].r)) return false;
    }
    return true;
}

/** @param {Cell} from @param {Cell} to @param {GraphNode[]} nodes @param {() => number} rng */
function pickCorridorMidPath(from, to, nodes, rng) {
    const order = rng() < 0.5;
    for (const horizontalFirst of order ? [true, false] : [false, true]) {
        const path = manhattanPath(from, to, horizontalFirst);
        if (corridorPathIsClear(nodes, path)) return path;
    }
    return null;
}

/** @param {DirectedEdge} edge @param {GraphNode[]} nodes @param {() => number} rng @param {number} egressCells */
function buildEdgeCorridorPath(edge, nodes, rng, egressCells) {
    /** @type {Cell[]} */
    const path = [edge.corridorFrom];
    let p = edge.corridorFrom;
    for (let i = 0; i < egressCells; i++) {
        p = stepAcrossSide(p, edge.parentHole.side);
        path.push(p);
    }
    const mid = pickCorridorMidPath(p, edge.corridorTo, nodes, rng);
    if (!mid) return null;
    for (let i = 1; i < mid.length; i++) path.push(mid[i]);
    return path;
}

/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {number} c @param {number} r */
function markMask(mask, cols, rows, c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    mask[cellIdx(cols, c, r)] = 1;
}

/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {Cell[]} path @param {number} halfWidth */
function stampCorridorTube(mask, cols, rows, path, halfWidth) {
    for (let i = 0; i < path.length; i++) {
        const p = path[i];
        const prev = path[i - 1];
        const next = path[i + 1];
        let alongH = false;
        let alongV = false;
        if (prev) {
            if (prev.c !== p.c) alongH = true;
            if (prev.r !== p.r) alongV = true;
        }
        if (next) {
            if (next.c !== p.c) alongH = true;
            if (next.r !== p.r) alongV = true;
        }
        if (alongH && alongV) {
            for (let dc = -halfWidth; dc <= halfWidth; dc++) {
                for (let dr = -halfWidth; dr <= halfWidth; dr++) markMask(mask, cols, rows, p.c + dc, p.r + dr);
            }
            continue;
        }
        if (alongH) {
            for (let dr = -halfWidth; dr <= halfWidth; dr++) markMask(mask, cols, rows, p.c, p.r + dr);
            continue;
        }
        if (alongV) {
            for (let dc = -halfWidth; dc <= halfWidth; dc++) markMask(mask, cols, rows, p.c + dc, p.r);
            continue;
        }
        markMask(mask, cols, rows, p.c, p.r);
    }
}

/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {number} originCol @param {number} originRow */
function railWallsFromFloorMask(mask, cols, rows, originCol, originRow) {
    /** @type {RailWall[]} */
    const walls = [];
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => {
        walls.push({ col: c + originCol, row: r + originRow, side, heightLevel: 1, thicknessLevel: 1 });
    };
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!mask[cellIdx(cols, c, r)]) continue;
            if (r === 0 || !mask[cellIdx(cols, c, r - 1)]) push(c, r, 0);
            if (c + 1 >= cols || !mask[cellIdx(cols, c + 1, r)]) push(c, r, 1);
            if (r + 1 >= rows || !mask[cellIdx(cols, c, r + 1)]) push(c, r, 2);
            if (c === 0 || !mask[cellIdx(cols, c - 1, r)]) push(c, r, 3);
        }
    }
    return walls;
}

/** Optional corridor pass — requires punched holes on directed edges. */
/** @param {RoomGraphLayout} layout @param {() => number} rng @param {number} originCol @param {number} originRow @param {{ halfWidth?: number, egressCells?: number }} [options] */
export function tryBuildCorridorRails(layout, rng, originCol, originRow, options = {}) {
    const halfWidth = options.halfWidth ?? DEFAULT_CORRIDOR_HALF_WIDTH;
    const egressCells = options.egressCells ?? DEFAULT_CORRIDOR_EGRESS_CELLS;
    const { rooms, graphEdges, gridCols, gridRows } = layout;
    const mask = new Uint8Array(gridCols * gridRows);
    /** @type {Cell[][]} */
    const paths = [];
    for (let i = 0; i < graphEdges.length; i++) {
        const edge = graphEdges[i];
        if (!edge.corridorFrom || !edge.corridorTo) return null;
        const path = buildEdgeCorridorPath(edge, rooms, rng, egressCells);
        if (!path) return null;
        paths.push(path);
        stampCorridorTube(mask, gridCols, gridRows, path, halfWidth);
    }
    return { paths, mask, railWalls: railWallsFromFloorMask(mask, gridCols, gridRows, originCol, originRow) };
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

/** @param {RoomGraphLayout} layout @param {number} originCol @param {number} originRow @param {number} [cellSize] */
export function propsForRoomCenters(layout, originCol, originRow, cellSize = 16) {
    const half = cellSize * 0.5;
    /** @type {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
    const props = [];
    for (let i = 0; i < layout.rooms.length; i++) {
        const room = layout.rooms[i];
        props.push({
            type: ROOM_PROP_TYPES[i % ROOM_PROP_TYPES.length],
            x: (room.centerC + originCol) * cellSize + half,
            y: (room.centerR + originRow) * cellSize + half,
            facing: 0,
            faction: "alpha",
        });
    }
    return props;
}

/** @param {RoomGraphLayout} layout @param {{ originCol: number, originRow: number, cellSize?: number, punchHoles?: boolean, includeCorridors?: boolean, requireCorridors?: boolean, corridorRng?: () => number, holeRng?: () => number }} options */
export function roomGraphLayoutToSceneDoc(layout, options) {
    const cellSize = options.cellSize ?? 16;
    const { originCol, originRow } = options;
    const closedRooms = layout.closedRooms ?? buildRoomsFromNodeGraph(layout.nodeGraph ?? { nodes: layout.rooms, treeEdges: layout.treeEdges, directedEdges: layout.graphEdges, seed: layout.seed, config: resolveNodeGraphGenConfig(), gridCols: layout.gridCols, gridRows: layout.gridRows });

    if (options.punchHoles === true && closedRooms.every((room) => room.holes.length === 0)) {
        const holeRng = options.holeRng ?? createSeededRng(layout.seed + 31337);
        punchHolesForDirectedEdges(layout.nodeGraph ?? { nodes: layout.rooms, treeEdges: layout.treeEdges, directedEdges: layout.graphEdges, seed: layout.seed, config: resolveNodeGraphGenConfig(), gridCols: layout.gridCols, gridRows: layout.gridRows }, closedRooms, holeRng);
    }

    const roomRails = railWallsForClosedRooms(closedRooms, originCol, originRow);
    /** @type {RailWall[]} */
    const corridorRails = [];
    /** @type {Cell[][]} */
    const corridorPaths = [];

    if (options.includeCorridors) {
        if (layout.graphEdges.some((edge) => !edge.corridorFrom || !edge.corridorTo)) {
            const holeRng = options.holeRng ?? createSeededRng(layout.seed + 31337);
            punchHolesForDirectedEdges(layout.nodeGraph ?? { nodes: layout.rooms, treeEdges: layout.treeEdges, directedEdges: layout.graphEdges, seed: layout.seed, config: resolveNodeGraphGenConfig(), gridCols: layout.gridCols, gridRows: layout.gridRows }, closedRooms, holeRng);
        }
        const rng = options.corridorRng ?? createSeededRng(layout.seed);
        const corridor = tryBuildCorridorRails(layout, rng, originCol, originRow);
        if (!corridor) {
            if (options.requireCorridors) throw new Error("Corridor routing failed for this layout");
        } else {
            corridorRails.push(...corridor.railWalls);
            corridorPaths.push(...corridor.paths);
        }
    }

    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize,
        origin: { minX: -1200, minY: -1200 },
        cols: 150,
        rows: 150,
        voxels: [],
        railWalls: mergeRailWalls([roomRails, corridorRails]),
        forcefields: [],
        portals: [],
        floorBelts: [],
        powerSources: [],
        props: propsForRoomCenters(layout, originCol, originRow, cellSize),
        meta: {
            generator: "roomGraph",
            seed: layout.seed,
            punchHoles: options.punchHoles === true || layout.graphEdges.some((edge) => edge.parentHole),
            includeCorridors: options.includeCorridors === true,
            rooms: layout.rooms.map((r) => ({ id: r.id, c0: r.c0, c1: r.c1, r0: r.r0, r1: r.r1, centerC: r.centerC, centerR: r.centerR, width: r.width, height: r.height })),
            edges: layout.graphEdges,
            corridors: corridorPaths.map((path, i) => ({ edge: i, length: path.length, from: path[0], to: path[path.length - 1] })),
        },
    };
}

/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number, punchHoles?: boolean, includeCorridors?: boolean, requireCorridors?: boolean }} [options] */
export function buildSandboxRoomGraphSceneDoc(options = {}) {
    const layout = tryBuildRoomGraphLayout({ ...options, punchHoles: options.punchHoles === true });
    const { originCol, originRow } = roomGraphOrigin(layout.gridCols, layout.gridRows);
    return roomGraphLayoutToSceneDoc(layout, {
        originCol,
        originRow,
        punchHoles: options.punchHoles === true,
        includeCorridors: options.includeCorridors === true,
        requireCorridors: options.requireCorridors === true,
        corridorRng: createSeededRng(layout.seed + 99991),
        holeRng: createSeededRng(layout.seed + 31337),
    });
}
