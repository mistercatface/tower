import { gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";
import { applySandboxSceneSnapshot } from "./sandboxSceneSnapshot.js";
import { validateRoomGraphMotifs } from "./roomGraphStepRegistry.js";
/** Edit this array to change generation — each step runs in order. */
export const DEFAULT_SANDBOX_GRAPH_MOTIFS = [
    {
        op: "retryUntil",
        maxAttempts: 60,
        body: [
            {
                op: "buildNodeGraph",
                nodeCount: 4,
                treeEdges: [
                    [0, 1],
                    [0, 2],
                    [2, 3],
                ],
                placement: "treeSpread",
                roomMinWidth: 10,
                roomMaxWidth: 10,
                roomMinHeight: 10,
                roomMaxHeight: 10,
                nodeSpacingPad: 4,
            },
            { op: "buildClosedRooms" },
            { op: "forEachNode", run: { op: "punchHolePerIncidentEdge", corridorCount: 2, corridorWidth: 2 } },
            { op: "forEachEdge", requireAll: true, canIntersect: false, run: { op: "buildCorridorForEdge", corridorCount: 2, corridorWidth: 2, skipPunchIfHolesPresent: true } },
            { op: "validateLayout", allTreeEdgesRouted: true, corridorCount: 2, corridorWidth: 2, corridorsIntersect: false },
            {
                op: "spawnPropsInNode",
                nodeId: 0,
                props: [
                    { type: "blue_ball", dc: -1, dr: 0 },
                    { type: "blue_ball", dc: 1, dr: 0 },
                ],
            },
        ],
        until: { op: "validateLayout", allTreeEdgesRouted: true, corridorCount: 2, corridorWidth: 2, corridorsIntersect: false },
    },
];
/** Per-run overrides (e.g. `seed`) merge onto this; edit motifs to change the pipeline. */
export const DEFAULT_SANDBOX_GRAPH_SCENE_OPTIONS = { motifs: DEFAULT_SANDBOX_GRAPH_MOTIFS };
/** @param {Record<string, unknown>} [overrides] */
export function resolveSandboxGraphSceneOptions(overrides = {}) {
    return { ...DEFAULT_SANDBOX_GRAPH_SCENE_OPTIONS, ...overrides };
}
/** Procedural room graph — new layout each call unless you pass a seed. */
export function buildSandboxGraphSceneDoc(options = {}) {
    return buildSandboxRoomGraphSceneDoc(resolveSandboxGraphSceneOptions(options));
}
/** Replace the current sandbox with a freshly generated room graph. */
export function spawnSandboxGraphScene(state, options = {}) {
    const result = tryBuildSandboxRoomGraphSceneDoc(options);
    if (!result.ok) throw new Error(result.reason);
    applySandboxSceneSnapshot(state, result.doc);
}
const SANDBOX_SCENE_SCHEMA_VERSION = 7;
/** @typedef {{ c: number, r: number }} Cell */
/** @typedef {{ id: number, c0: number, r0: number, c1: number, r1: number, centerC: number, centerR: number, width: number, height: number }} GraphNode */
/** @typedef {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }} RailWall */
/** @typedef {{ c: number, r: number, side: number }} RoomWallHole */
/** @typedef {{ a: number, b: number, travel: number, parentSocket: number, childSocket: number, parentHole?: RoomWallHole, childHole?: RoomWallHole, parentHoles?: RoomWallHole[], childHoles?: RoomWallHole[], corridorFrom?: Cell, corridorTo?: Cell }} DirectedEdge */
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
 *   treeEdges?: [number, number][],
 *   placement?: "random" | "treeSpread",
 *   treeSpreadCorridorPad?: number,
 * }} NodeGraphGenConfig
 */
/** @typedef {{ seed: number, config: NodeGraphGenConfig, gridCols: number, gridRows: number, nodes: GraphNode[], treeEdges: { a: number, b: number }[], directedEdges: DirectedEdge[] }} NodeGraph */
/** @typedef {{ seed: number, gridCols: number, gridRows: number, rooms: GraphNode[], treeEdges: { a: number, b: number }[], graphEdges: DirectedEdge[], nodeGraph: NodeGraph, closedRooms: ClosedRoom[] }} RoomGraphLayout */
/** @typedef {{ op: "buildNodeGraph", nodeCount?: number, treeEdges?: [number, number][], placement?: "random" | "treeSpread", treeSpreadCorridorPad?: number, gridCols?: number, gridRows?: number, roomMinWidth?: number, roomMaxWidth?: number, roomMinHeight?: number, roomMaxHeight?: number, nodeSpacingPad?: number }} BuildNodeGraphMotif */
/** @typedef {{ op: "buildClosedRooms" }} BuildClosedRoomsMotif */
/** @typedef {{ type: string, dc?: number, dr?: number, facing?: number, faction?: string }} RoomPropSpec */
/** @typedef {{ type: string, x: number, y: number, facing: number, faction: string }} SandboxSceneProp */
/** @typedef {{ op: "spawnProps", props: RoomPropSpec[] }} SpawnPropsRoomMotif */
/** @typedef {PunchHoleInClosedRoomRoomMotif | SpawnPropsRoomMotif} RoomGraphRoomMotif */
/** @typedef {{ op: "forEachRoom", run: RoomGraphRoomMotif }} ForEachRoomMotif */
/** @typedef {{ op: "punchHolesTowardNeighbors" }} PunchHolesTowardNeighborsEdgeMotif */
/** @typedef {{ op: "buildCorridorForEdge", corridorCount?: number, corridorWidth?: number, canIntersect?: boolean, skipPunchIfHolesPresent?: boolean }} BuildCorridorForEdgeEdgeMotif */
/** @typedef {PunchHolesTowardNeighborsEdgeMotif | BuildCorridorForEdgeEdgeMotif} RoomGraphEdgeMotif */
/** @typedef {{ op: "forEachEdge", run: RoomGraphEdgeMotif, shuffle?: boolean, limit?: number, corridorCount?: number, corridorWidth?: number, canIntersect?: boolean, requireAll?: boolean }} ForEachEdgeMotif */
/** @typedef {{ op: "punchHolePerIncidentEdge", corridorCount?: number, corridorWidth?: number }} PunchHolePerIncidentEdgeNodeMotif */
/** @typedef {PunchHolePerIncidentEdgeNodeMotif} RoomGraphNodeMotif */
/** @typedef {{ op: "forEachNode", run: RoomGraphNodeMotif, corridorCount?: number, corridorWidth?: number }} ForEachNodeMotif */
/** @typedef {{ op: "validateLayout", minNodes?: number, corridorCount?: number, corridorWidth?: number, corridorsAtLeast?: number, allTreeEdgesRouted?: boolean, corridorsIntersect?: boolean }} ValidateLayoutMotif */
/** @typedef {{ op: "retryUntil", maxAttempts?: number, body: RoomGraphMotif[], until: ValidateLayoutMotif }} RetryUntilMotif */
/** @typedef {{ op: "punchOneHolePerRoom" }} PunchOneHolePerRoomMotif */
/** @typedef {{ op: "buildCorridors", corridorEdgeCount?: number, canIntersect?: boolean, requireAll?: boolean }} BuildCorridorsMotif */
/** @typedef {{ op: "buildAllCorridors", canIntersect?: boolean, requireAll?: boolean }} BuildAllCorridorsMotif */
/** @typedef {{ op: "spawnPropsInNode", nodeId: number, props: RoomPropSpec[] }} SpawnPropsInNodeMotif */
/** @typedef {{ op: "spawnPropsPerRoom" }} SpawnPropsPerRoomMotif */
/** @typedef {BuildNodeGraphMotif | BuildClosedRoomsMotif | ForEachRoomMotif | ForEachEdgeMotif | ForEachNodeMotif | ValidateLayoutMotif | RetryUntilMotif | PunchOneHolePerRoomMotif | BuildCorridorsMotif | BuildAllCorridorsMotif | SpawnPropsInNodeMotif | SpawnPropsPerRoomMotif} RoomGraphMotif */
/** @typedef {{ options: Record<string, unknown>, layout: RoomGraphLayout, closedRooms: ClosedRoom[], corridorRails: RailWall[], corridorPaths: Cell[][], corridorEdgeIndices: number[], props: SandboxSceneProp[], originCol: number, originRow: number, cellSize: number, corridorRng: () => number, holeRng: () => number }} RoomGraphBuildCtx */
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
export const DEFAULT_CORRIDOR_HALF_WIDTH = 0;
export const DEFAULT_CORRIDOR_WIDTH = 1;
export const DEFAULT_CORRIDOR_EGRESS_CELLS = 2;
/** @param {number} width */
export function corridorPerpendicularOffsets(width) {
    const offsets = new Array(width);
    const base = (width - 1) >> 1;
    for (let i = 0; i < width; i++) offsets[i] = i - base;
    return offsets;
}
/** @param {{ corridorWidth?: number, halfWidth?: number }} [options] */
export function resolveCorridorWidth(options = {}) {
    if (options.corridorWidth != null) return options.corridorWidth;
    if (options.halfWidth != null) return options.halfWidth * 2 + 1;
    return DEFAULT_CORRIDOR_WIDTH;
}
export const DEFAULT_SANDBOX_GRAPH_CELL_SIZE = 16;
/** Procgen layout grid — grows with node count / tree depth; scene sandbox is at least this large. */
export const NODE_GRAPH_GRID_MIN = 64;
export const NODE_GRAPH_GRID_MAX = 384;
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
        treeEdges: overrides.treeEdges,
        placement: overrides.placement ?? "random",
        treeSpreadCorridorPad: overrides.treeSpreadCorridorPad ?? DEFAULT_CORRIDOR_EGRESS_CELLS + 2,
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
        nodes.push({ id: nodes.length, c0, r0, c1, r1, centerC: ((c0 + c1) / 2) | 0, centerR: ((r0 + r1) / 2) | 0, width, height });
    }
    return nodes;
}
/** @deprecated Use {@link placeGraphNodes}. */
export function placeRooms(rng, cols, rows, count) {
    return placeGraphNodes(rng, resolveNodeGraphGenConfig({ gridCols: cols, gridRows: rows, nodeCount: count }));
}
/** @param {[number, number][] | { a: number, b: number }[]} spec @param {number} nodeCount */
export function parseTreeEdgesSpec(spec, nodeCount) {
    /** @type {{ a: number, b: number }[]} */
    const edges = [];
    for (let i = 0; i < spec.length; i++) {
        const entry = spec[i];
        const a = Array.isArray(entry) ? entry[0] : entry.a;
        const b = Array.isArray(entry) ? entry[1] : entry.b;
        edges.push({ a, b });
    }
    if (edges.length !== nodeCount - 1) throw new Error(`treeEdges: expected ${nodeCount - 1} edges for ${nodeCount} nodes, got ${edges.length}`);
    const parentCount = new Uint16Array(nodeCount);
    for (let i = 0; i < edges.length; i++) {
        const { a, b } = edges[i];
        if (a < 0 || b < 0 || a >= nodeCount || b >= nodeCount) throw new Error(`treeEdges: node id out of range on edge ${a}->${b}`);
        if (a === b) throw new Error(`treeEdges: self edge ${a}->${b}`);
        parentCount[b]++;
        if (parentCount[b] > 1) throw new Error(`treeEdges: node ${b} has multiple parents`);
    }
    if (parentCount[0] !== 0) throw new Error("treeEdges: node 0 must be the root");
    for (let i = 1; i < nodeCount; i++) if (parentCount[i] !== 1) throw new Error(`treeEdges: node ${i} must have exactly one parent`);
    return edges;
}
/** @param {{ a: number, b: number }[]} treeEdges @param {number} nodeCount */
export function childrenMapFromTreeEdges(treeEdges, nodeCount) {
    /** @type {number[][]} */
    const children = [];
    for (let i = 0; i < nodeCount; i++) children.push([]);
    for (let i = 0; i < treeEdges.length; i++) children[treeEdges[i].a].push(treeEdges[i].b);
    return children;
}
/** @param {number[][]} children @param {number} [rootId] */
function maxTreeDepthFromRoot(children, rootId = 0) {
    /** @param {number} id */
    function depth(id) {
        const kids = children[id];
        if (kids.length === 0) return 0;
        let best = 0;
        for (let i = 0; i < kids.length; i++) best = Math.max(best, 1 + depth(kids[i]));
        return best;
    }
    return depth(rootId);
}
/** @param {NodeGraphGenConfig} config @param {{ a: number, b: number }[]} treeEdges @param {number} nodeCount */
export function estimateTreeSpreadGridSize(config, treeEdges, nodeCount) {
    const children = childrenMapFromTreeEdges(treeEdges, nodeCount);
    const maxDepth = Math.max(1, maxTreeDepthFromRoot(children, 0));
    let maxFanout = 0;
    for (let i = 0; i < nodeCount; i++) maxFanout = Math.max(maxFanout, children[i].length);
    const maxRoom = Math.max(config.roomMaxWidth, config.roomMaxHeight);
    const corridorPad = config.treeSpreadCorridorPad ?? DEFAULT_CORRIDOR_EGRESS_CELLS + 2;
    const maxHop = treeSpreadCenterStep(maxRoom, maxRoom, maxRoom, maxRoom, config.nodeSpacingPad, corridorPad);
    const radial = maxDepth * maxHop + maxRoom;
    const lateral = Math.ceil(maxFanout / 2) * maxHop;
    const half = radial + lateral + config.gridEdgeMargin;
    const size = Math.min(NODE_GRAPH_GRID_MAX, Math.max(NODE_GRAPH_GRID_MIN, half * 2));
    return { gridCols: Math.max(config.gridCols ?? 0, size), gridRows: Math.max(config.gridRows ?? 0, size) };
}
/** Random tree on node ids 0..n-1 (node 0 root). Used when nodeCount > 1 and treeEdges is empty. */
/** @param {number} nodeCount @param {() => number} rng @param {number} treeParentCandidateCount */
export function buildRandomTreeEdges(nodeCount, rng, treeParentCandidateCount = DEFAULT_NODE_GRAPH_GEN_CONFIG.treeParentCandidateCount) {
    if (nodeCount <= 1) return [];
    /** @type {{ a: number, b: number }[]} */
    const edges = [];
    const inTree = new Uint8Array(nodeCount);
    inTree[0] = 1;
    for (let k = 1; k < nodeCount; k++) {
        /** @type {number[]} */
        const outside = [];
        for (let j = 0; j < nodeCount; j++) if (!inTree[j]) outside.push(j);
        const j = outside[(rng() * outside.length) | 0];
        /** @type {number[]} */
        const parents = [];
        for (let i = 0; i < nodeCount; i++) if (inTree[i]) parents.push(i);
        const pick = parents[Math.min((rng() * Math.min(treeParentCandidateCount, parents.length)) | 0, parents.length - 1)];
        inTree[j] = 1;
        edges.push({ a: pick, b: j });
    }
    return edges;
}
/** @param {NodeGraphGenConfig} config @param {() => number} rng */
function resolveTreeEdgesForConfig(config, rng) {
    if (config.nodeCount <= 1) return [];
    if (Array.isArray(config.treeEdges) && config.treeEdges.length > 0) return parseTreeEdgesSpec(config.treeEdges, config.nodeCount);
    return buildRandomTreeEdges(config.nodeCount, rng, config.treeParentCandidateCount);
}
/** @param {NodeGraphGenConfig} config @param {{ a: number, b: number }[]} treeEdges */
function configWithTreeSpreadGrid(config, treeEdges) {
    return { ...config, ...estimateTreeSpreadGridSize(config, treeEdges, config.nodeCount) };
}
/** @param {number} centerC @param {number} centerR @param {number} width @param {number} height @param {number} id */
function graphNodeAtCenter(centerC, centerR, width, height, id) {
    const c0 = (centerC - (width - 1) / 2) | 0;
    const r0 = (centerR - (height - 1) / 2) | 0;
    return { id, c0, r0, c1: c0 + width - 1, r1: r0 + height - 1, centerC, centerR, width, height };
}
/** @param {GraphNode} a @param {GraphNode} b @param {number} pad */
function graphNodesOverlap(a, b, pad) {
    return a.c0 - pad <= b.c1 && a.c1 + pad >= b.c0 && a.r0 - pad <= b.r1 && a.r1 + pad >= b.r0;
}
/** @param {number} parentW @param {number} parentH @param {number} childW @param {number} childH @param {number} pad @param {number} corridorPad */
function treeSpreadCenterStep(parentW, parentH, childW, childH, pad, corridorPad) {
    const parentHalf = Math.max((parentW - 1) / 2, (parentH - 1) / 2);
    const childHalf = Math.max((childW - 1) / 2, (childH - 1) / 2);
    return Math.ceil(parentHalf + childHalf + pad + corridorPad);
}
/** @param {number} childIndex @param {number} siblingCount */
function treeSpreadUnitDelta(childIndex, siblingCount) {
    const angle = (Math.PI * 2 * childIndex) / siblingCount - Math.PI / 2;
    return { dc: Math.cos(angle), dr: Math.sin(angle) };
}
/** Place rooms along the tree: root at grid center, each child steps outward on its branch ray. */
/** @param {() => number} rng @param {NodeGraphGenConfig} config @param {{ a: number, b: number }[]} treeEdges */
export function placeGraphNodesTreeSpread(rng, config, treeEdges) {
    const { gridCols, gridRows, nodeCount, nodeSpacingPad, gridEdgeMargin, roomMinWidth, roomMaxWidth, roomMinHeight, roomMaxHeight, treeSpreadCorridorPad } = config;
    const children = childrenMapFromTreeEdges(treeEdges, nodeCount);
    const maxDepth = Math.max(1, maxTreeDepthFromRoot(children, 0));
    const maxRoom = Math.max(roomMaxWidth, roomMaxHeight);
    const maxHop = treeSpreadCenterStep(maxRoom, maxRoom, maxRoom, maxRoom, nodeSpacingPad, treeSpreadCorridorPad);
    const vertHalf = (gridRows / 2) | 0;
    const horizHalf = (gridCols / 2) | 0;
    const need = maxDepth * maxHop + maxRoom + gridEdgeMargin;
    if (need > vertHalf || need > horizHalf) throw new Error(`treeSpread: grid ${gridCols}x${gridRows} too small for depth ${maxDepth} at room size ${maxRoom}`);
    const widths = new Int32Array(nodeCount);
    const heights = new Int32Array(nodeCount);
    for (let i = 0; i < nodeCount; i++) {
        widths[i] = randomIntInclusive(roomMinWidth, roomMaxWidth, rng);
        heights[i] = randomIntInclusive(roomMinHeight, roomMaxHeight, rng);
    }
    /** @type {(GraphNode | undefined)[]} */
    const nodes = [];
    const branchDc = new Float64Array(nodeCount);
    const branchDr = new Float64Array(nodeCount);
    nodes[0] = graphNodeAtCenter((gridCols / 2) | 0, (gridRows / 2) | 0, widths[0], heights[0], 0);
    /** @type {number[]} */
    const queue = [0];
    for (let qi = 0; qi < queue.length; qi++) {
        const parentId = queue[qi];
        const parent = nodes[parentId];
        const kids = children[parentId];
        for (let i = 0; i < kids.length; i++) {
            const childId = kids[i];
            let udc = branchDc[parentId];
            let udr = branchDr[parentId];
            if (parentId === 0) {
                const unit = treeSpreadUnitDelta(i, kids.length);
                udc = unit.dc;
                udr = unit.dr;
                branchDc[childId] = udc;
                branchDr[childId] = udr;
            } else {
                branchDc[childId] = udc;
                branchDr[childId] = udr;
            }
            const step = treeSpreadCenterStep(parent.width, parent.height, widths[childId], heights[childId], nodeSpacingPad, treeSpreadCorridorPad);
            const centerC = Math.round(parent.centerC + udc * step);
            const centerR = Math.round(parent.centerR + udr * step);
            nodes[childId] = graphNodeAtCenter(centerC, centerR, widths[childId], heights[childId], childId);
            queue.push(childId);
        }
    }
    for (let i = 0; i < nodeCount; i++) {
        const node = nodes[i];
        if (node.c0 < gridEdgeMargin || node.r0 < gridEdgeMargin || node.c1 >= gridCols - gridEdgeMargin || node.r1 >= gridRows - gridEdgeMargin)
            throw new Error(`treeSpread: node ${i} out of grid bounds`);
        for (let j = 0; j < i; j++) if (graphNodesOverlap(nodes[j], node, nodeSpacingPad)) throw new Error(`treeSpread: node ${i} overlaps node ${j}`);
    }
    return /** @type {GraphNode[]} */ (nodes);
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
        directedEdges.push({ a, b, travel: travelFromSocketSide(socketSideToward(parent, child)), parentSocket: socketSideToward(parent, child), childSocket: socketSideToward(child, parent) });
    }
    return directedEdges;
}
/** Step A+B — node placement + branching directed graph. No geometry beyond node bounds. */
/** @param {() => number} rng @param {NodeGraphGenConfig} config */
export function buildNodeGraph(rng, config) {
    /** @type {{ a: number, b: number }[]} */
    let treeEdges;
    /** @type {GraphNode[]} */
    let nodes;
    /** @type {NodeGraphGenConfig} */
    let layoutConfig = config;
    if (config.placement === "treeSpread") {
        treeEdges = resolveTreeEdgesForConfig(config, rng);
        layoutConfig = configWithTreeSpreadGrid(config, treeEdges);
        nodes = placeGraphNodesTreeSpread(rng, layoutConfig, treeEdges);
    } else if (Array.isArray(config.treeEdges) && config.treeEdges.length > 0) {
        treeEdges = parseTreeEdgesSpec(config.treeEdges, config.nodeCount);
        nodes = placeGraphNodes(rng, config);
        if (nodes.length < config.nodeCount) throw new Error(`placement: placed ${nodes.length}/${config.nodeCount} nodes`);
    } else {
        nodes = placeGraphNodes(rng, config);
        treeEdges = buildBranchingNodeTree(nodes, rng, config.treeParentCandidateCount);
    }
    const directedEdges = buildDirectedGraphEdges(nodes, treeEdges);
    return { seed: config.seed, config: layoutConfig, gridCols: layoutConfig.gridCols, gridRows: layoutConfig.gridRows, nodes, treeEdges, directedEdges };
}
/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number, maxAttempts?: number, treeEdges?: [number, number][] }} [options] */
export function tryBuildNodeGraph(options = {}) {
    const base = resolveNodeGraphGenConfig(options);
    const maxAttempts = options.maxAttempts ?? options.layoutMaxAttempts ?? base.layoutMaxAttempts;
    const requiredNodes = base.placement === "treeSpread" || (Array.isArray(base.treeEdges) && base.treeEdges.length > 0) ? base.nodeCount : base.minNodes;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const config = { ...base, seed: base.seed + attempt };
        const rng = createSeededRng(config.seed);
        try {
            const nodeGraph = buildNodeGraph(rng, config);
            if (nodeGraph.nodes.length >= requiredNodes) return nodeGraph;
        } catch {
            continue;
        }
    }
    throw new Error(`Node graph layout failed — could not place ${requiredNodes} nodes in ${maxAttempts} attempts`);
}
/** Step B — one closed rail rectangle per node; no holes until `punchHoleInClosedRoom`. */
/** @param {NodeGraph} nodeGraph */
export function buildRoomsFromNodeGraph(nodeGraph) {
    return nodeGraph.nodes.map((node) => ({ node, gaps: new Set(), holes: [] }));
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
    for (let i = 0; i < closedRooms.length; i++) walls.push(...railWallsForClosedRoom(closedRooms[i], originCol, originRow));
    return walls;
}
/** @param {RoomWallHole[]} slots @param {number} start @param {number} width */
function wallSlotsContiguous(slots, start, width) {
    if (start + width > slots.length) return false;
    for (let i = 1; i < width; i++) {
        const a = slots[start + i - 1];
        const b = slots[start + i];
        if (a.side !== b.side) return false;
        if (a.side === 0 || a.side === 2) {
            if (a.r !== b.r || b.c !== a.c + 1) return false;
        } else if (a.c !== b.c || b.r !== a.r + 1) return false;
    }
    return true;
}
/** @param {RoomWallHole} slot @param {RoomWallHole} hole */
function sameWallSlot(slot, hole) {
    return slot.c === hole.c && slot.r === hole.r && slot.side === hole.side;
}
/** Punch `corridorCount` hole groups on the wall face toward `targetNode`; each group is `corridorWidth` contiguous slots (anchor = center slot per group). */
/** @param {ClosedRoom} closedRoom @param {GraphNode} targetNode @param {() => number} rng @param {number} corridorCount @param {number} [corridorWidth] */
export function punchHolesTowardNeighbor(closedRoom, targetNode, rng, corridorCount, corridorWidth = 1) {
    const side = socketSideToward(closedRoom.node, targetNode);
    /** @type {RoomWallHole[]} */
    let open = listClosedRoomWallEdgeSlots(closedRoom.node).filter((slot) => slot.side === side && !closedRoom.gaps.has(roomWallEdgeKey(slot.c, slot.r, slot.side)));
    const needSlots = corridorCount * corridorWidth;
    if (open.length < needSlots) throw new Error(`punchHolesTowardNeighbor: need ${needSlots} open slots toward node ${targetNode.id}, have ${open.length}`);
    /** @type {RoomWallHole[]} */
    const anchors = [];
    for (let lane = 0; lane < corridorCount; lane++) {
        if (corridorWidth === 1) {
            const pick = (rng() * open.length) | 0;
            const hole = open[pick];
            open.splice(pick, 1);
            closedRoom.gaps.add(roomWallEdgeKey(hole.c, hole.r, hole.side));
            closedRoom.holes.push(hole);
            anchors.push(hole);
            continue;
        }
        /** @type {number[]} */
        const groupStarts = [];
        for (let s = 0; s <= open.length - corridorWidth; s++) if (wallSlotsContiguous(open, s, corridorWidth)) groupStarts.push(s);
        if (groupStarts.length === 0) throw new Error(`punchHolesTowardNeighbor: no ${corridorWidth}-wide opening toward node ${targetNode.id}`);
        const start = groupStarts[(rng() * groupStarts.length) | 0];
        const group = open.slice(start, start + corridorWidth);
        for (let gi = 0; gi < group.length; gi++) {
            const hole = group[gi];
            closedRoom.gaps.add(roomWallEdgeKey(hole.c, hole.r, hole.side));
            closedRoom.holes.push(hole);
        }
        anchors.push(group[(corridorWidth - 1) >> 1]);
        open = open.filter((slot) => !group.some((hole) => sameWallSlot(slot, hole)));
    }
    return anchors;
}
/** Punch one random 1-wide hole on the wall face that points at `targetNode`. */
/** @param {ClosedRoom} closedRoom @param {GraphNode} targetNode @param {() => number} rng */
export function punchHoleTowardNeighbor(closedRoom, targetNode, rng) {
    return punchHolesTowardNeighbor(closedRoom, targetNode, rng, 1)[0];
}
/** @param {ClosedRoom} closedRoom */
function snapshotClosedRoom(closedRoom) {
    return { gaps: new Set(closedRoom.gaps), holes: closedRoom.holes.slice() };
}
/** @param {ClosedRoom} closedRoom @param {{ gaps: Set<string>, holes: RoomWallHole[] }} snap */
function restoreClosedRoom(closedRoom, snap) {
    closedRoom.gaps = new Set(snap.gaps);
    closedRoom.holes = snap.holes.slice();
}
/** @param {number} c @param {number} r @param {number} side @param {number} originCol @param {number} originRow */
function roomWallGapKeyWorld(c, r, side, originCol, originRow) {
    return `${c + originCol},${r + originRow},${side}`;
}
/** Both (cell, side) keys for one physical edge — room hole + corridor neighbor mirror. */
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
/** Punch one random 1-wide hole in a closed room. Call again for a second hole. Mutates `closedRoom`. */
/** @param {ClosedRoom} closedRoom @param {() => number} rng */
export function punchHoleInClosedRoom(closedRoom, rng) {
    const open = listClosedRoomWallEdgeSlots(closedRoom.node).filter((slot) => !closedRoom.gaps.has(roomWallEdgeKey(slot.c, slot.r, slot.side)));
    const hole = open[(rng() * open.length) | 0];
    closedRoom.gaps.add(roomWallEdgeKey(hole.c, hole.r, hole.side));
    closedRoom.holes.push(hole);
    return hole;
}
/** Punch exactly one random hole in every closed room. */
/** @param {ClosedRoom[]} closedRooms @param {() => number} rng */
export function punchOneHolePerRoom(closedRooms, rng) {
    for (let i = 0; i < closedRooms.length; i++) punchHoleInClosedRoom(closedRooms[i], rng);
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
/** Attach a directed edge to each endpoint room's sole punched hole. */
/** @param {DirectedEdge} edge @param {ClosedRoom[]} closedRooms */
export function wireDirectedEdgeToRoomHoles(edge, closedRooms) {
    edge.parentHole = closedRooms[edge.a].holes[0];
    edge.childHole = closedRooms[edge.b].holes[0];
    edge.corridorFrom = stepAcrossSide(edge.parentHole, edge.parentHole.side);
    edge.corridorTo = stepAcrossSide(edge.childHole, edge.childHole.side);
}
/** Full layout: node graph + closed rooms. Holes only when requested. */
/** @param {Partial<NodeGraphGenConfig> & { seed?: number, roomCount?: number, minRooms?: number, maxAttempts?: number, punchHoles?: boolean, punchOneHolePerRoom?: boolean, holeRng?: () => number }} [options] */
export function tryBuildRoomGraphLayout(options = {}) {
    const nodeGraph = tryBuildNodeGraph(options);
    const closedRooms = buildRoomsFromNodeGraph(nodeGraph);
    if (options.punchOneHolePerRoom === true) {
        const holeRng = options.holeRng ?? createSeededRng(nodeGraph.seed + 31337);
        punchOneHolePerRoom(closedRooms, holeRng);
    } else if (options.punchHoles === true) {
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
    const closedRooms =
        layout.closedRooms ??
        buildRoomsFromNodeGraph(
            layout.nodeGraph ?? {
                nodes: layout.rooms,
                treeEdges: layout.treeEdges,
                directedEdges: layout.graphEdges,
                seed: layout.seed,
                config: resolveNodeGraphGenConfig(),
                gridCols: layout.gridCols,
                gridRows: layout.gridRows,
            },
        );
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
    for (let i = 1; i < path.length - 1; i++) if (cellInsideAnyNode(nodes, path[i].c, path[i].r)) return false;
    return true;
}
/** @param {Cell} from @param {Cell} to @param {GraphNode[]} nodes */
function listClearCorridorMidPaths(from, to, nodes) {
    /** @type {Cell[][]} */
    const paths = [];
    for (const horizontalFirst of [true, false]) {
        const path = manhattanPath(from, to, horizontalFirst);
        if (corridorPathIsClear(nodes, path)) paths.push(path);
    }
    return paths;
}
/** @param {Cell} from @param {Cell} to @param {GraphNode[]} nodes @param {() => number} rng */
function pickCorridorMidPath(from, to, nodes, rng) {
    const paths = listClearCorridorMidPaths(from, to, nodes);
    if (paths.length === 0) return null;
    return paths[(rng() * paths.length) | 0];
}
/** 1-wide corridor: straight egress from parent hole, manhattan mid, straight ingress to child hole. */
/** @param {RoomWallHole} parentHole @param {RoomWallHole} childHole @param {GraphNode[]} nodes @param {() => number} rng @param {number} egressCells @param {{ existingPaths?: Cell[][], tryAllMidOrders?: boolean, corridorWidth?: number }} [options] */
export function buildCorridorPathBetweenHoles(parentHole, childHole, nodes, rng, egressCells, options = {}) {
    const existingPaths = options.existingPaths ?? [];
    const tryAllMidOrders = options.tryAllMidOrders === true;
    const corridorWidth = options.corridorWidth ?? DEFAULT_CORRIDOR_WIDTH;
    const corridorFrom = stepAcrossSide(parentHole, parentHole.side);
    const corridorTo = stepAcrossSide(childHole, childHole.side);
    const approachEnd = stepAcrossSide(corridorTo, childHole.side);
    let egressEnd = corridorFrom;
    for (let i = 0; i < egressCells; i++) egressEnd = stepAcrossSide(egressEnd, parentHole.side);
    const allMids = listClearCorridorMidPaths(egressEnd, approachEnd, nodes);
    if (allMids.length === 0) return null;
    const mids = tryAllMidOrders ? allMids : [allMids[(rng() * allMids.length) | 0]];
    for (let mi = 0; mi < mids.length; mi++) {
        const mid = mids[mi];
        /** @type {Cell[]} */
        const path = [corridorFrom];
        let p = corridorFrom;
        for (let i = 0; i < egressCells; i++) {
            p = stepAcrossSide(p, parentHole.side);
            path.push(p);
        }
        for (let i = 1; i < mid.length; i++) path.push(mid[i]);
        p = path[path.length - 1];
        while (p.c !== corridorTo.c || p.r !== corridorTo.r) {
            if (p.c !== corridorTo.c) p = { c: p.c + (corridorTo.c > p.c ? 1 : -1), r: p.r };
            else p = { c: p.c, r: p.r + (corridorTo.r > p.r ? 1 : -1) };
            path.push(p);
        }
        if (!corridorPathIsClear(nodes, path)) continue;
        if (existingPaths.length && corridorPathIntersectsAny(path, existingPaths, corridorWidth)) continue;
        return path;
    }
    return null;
}
/** @param {Cell} p @param {Cell | undefined} prev @param {Cell | undefined} next @param {number} corridorWidth @param {boolean} interiorOnly @param {number} pathIndex @param {number} pathLength */
function collectCorridorPathPointCells(p, prev, next, corridorWidth, interiorOnly, pathIndex, pathLength) {
    if (interiorOnly && (pathIndex === 0 || pathIndex === pathLength - 1)) return [];
    const offsets = corridorPerpendicularOffsets(corridorWidth);
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
    /** @type {Cell[]} */
    const cells = [];
    if (alongH && alongV) {
        for (let oi = 0; oi < offsets.length; oi++) for (let oj = 0; oj < offsets.length; oj++) cells.push({ c: p.c + offsets[oi], r: p.r + offsets[oj] });
        return cells;
    }
    if (alongH) {
        for (let oi = 0; oi < offsets.length; oi++) cells.push({ c: p.c, r: p.r + offsets[oi] });
        return cells;
    }
    if (alongV) {
        for (let oi = 0; oi < offsets.length; oi++) cells.push({ c: p.c + offsets[oi], r: p.r });
        return cells;
    }
    cells.push({ c: p.c, r: p.r });
    return cells;
}
/** @param {Cell[]} path @param {number} corridorWidth @param {{ interiorOnly?: boolean }} [options] */
function corridorPathOccupiedCellKeys(path, corridorWidth, options = {}) {
    const interiorOnly = options.interiorOnly !== false;
    /** @type {Set<string>} */
    const keys = new Set();
    for (let i = 0; i < path.length; i++) {
        const cells = collectCorridorPathPointCells(path[i], path[i - 1], path[i + 1], corridorWidth, interiorOnly, i, path.length);
        for (let ci = 0; ci < cells.length; ci++) keys.add(corridorCellKey(cells[ci]));
    }
    return keys;
}
/** @param {Cell} cell */
function corridorCellKey(cell) {
    return `${cell.c},${cell.r}`;
}
/** @param {Cell[]} path @param {Cell[][]} others — interior footprint only; endpoints may meet at room holes. @param {number} [corridorWidth] */
export function corridorPathIntersectsAny(path, others, corridorWidth = DEFAULT_CORRIDOR_WIDTH) {
    const keys = corridorPathOccupiedCellKeys(path, corridorWidth);
    for (let i = 0; i < others.length; i++) {
        const otherKeys = corridorPathOccupiedCellKeys(others[i], corridorWidth);
        for (const key of otherKeys) if (keys.has(key)) return true;
    }
    return false;
}
/** @param {DirectedEdge} edge @param {GraphNode[]} nodes @param {() => number} rng @param {number} egressCells */
function buildEdgeCorridorPath(edge, nodes, rng, egressCells) {
    return buildCorridorPathBetweenHoles(edge.parentHole, edge.childHole, nodes, rng, egressCells);
}
/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {number} c @param {number} r */
function markMask(mask, cols, rows, c, r) {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    mask[cellIdx(cols, c, r)] = 1;
}
/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {Cell[]} path @param {number} corridorWidth */
function stampCorridorTube(mask, cols, rows, path, corridorWidth) {
    for (let i = 0; i < path.length; i++) {
        const cells = collectCorridorPathPointCells(path[i], path[i - 1], path[i + 1], corridorWidth, false, i, path.length);
        for (let ci = 0; ci < cells.length; ci++) markMask(mask, cols, rows, cells[ci].c, cells[ci].r);
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
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (!mask[cellIdx(cols, c, r)]) continue;
            if (r === 0 || !mask[cellIdx(cols, c, r - 1)]) push(c, r, 0);
            if (c + 1 >= cols || !mask[cellIdx(cols, c + 1, r)]) push(c, r, 1);
            if (r + 1 >= rows || !mask[cellIdx(cols, c, r + 1)]) push(c, r, 2);
            if (c === 0 || !mask[cellIdx(cols, c - 1, r)]) push(c, r, 3);
        }
    return walls;
}
/** Optional corridor pass — requires punched holes on directed edges. */
/** @param {RoomGraphLayout} layout @param {() => number} rng @param {number} originCol @param {number} originRow @param {{ corridorWidth?: number, halfWidth?: number, egressCells?: number }} [options] */
export function tryBuildCorridorRails(layout, rng, originCol, originRow, options = {}) {
    const corridorWidth = resolveCorridorWidth(options);
    const egressCells = options.egressCells ?? DEFAULT_CORRIDOR_EGRESS_CELLS;
    const { rooms, graphEdges, gridCols, gridRows } = layout;
    const mask = new Uint8Array(gridCols * gridRows);
    /** @type {Cell[][]} */
    const paths = [];
    for (let i = 0; i < graphEdges.length; i++) {
        const edge = graphEdges[i];
        if (!edge.parentHole || !edge.childHole) return null;
        const path = buildEdgeCorridorPath(edge, rooms, rng, egressCells);
        if (!path) return null;
        paths.push(path);
        stampCorridorTube(mask, gridCols, gridRows, path, corridorWidth);
    }
    return { paths, mask, railWalls: railWallsFromFloorMask(mask, gridCols, gridRows, originCol, originRow) };
}
/** @param {DirectedEdge} edge @param {number} corridorCount */
function edgeHasPunchedHoles(edge, corridorCount) {
    if (edge.parentHoles && edge.childHoles && edge.parentHoles.length >= corridorCount && edge.childHoles.length >= corridorCount) return true;
    return corridorCount === 1 && !!edge.parentHole && !!edge.childHole;
}
/** @param {DirectedEdge} edge @param {number} lane */
function edgeHolePairAtLane(edge, lane) {
    const parentHole = edge.parentHoles?.[lane] ?? (lane === 0 ? edge.parentHole : undefined);
    const childHole = edge.childHoles?.[lane] ?? (lane === 0 ? edge.childHole : undefined);
    return { parentHole, childHole };
}
/** @param {DirectedEdge} edge */
function clearEdgeHoleFields(edge) {
    edge.parentHole = undefined;
    edge.childHole = undefined;
    edge.parentHoles = undefined;
    edge.childHoles = undefined;
    edge.corridorFrom = undefined;
    edge.corridorTo = undefined;
}
/** Route one tree edge: punch facing holes on both rooms. */
/** @param {RoomGraphLayout} layout @param {ClosedRoom[]} closedRooms @param {number} edgeIndex @param {() => number} rng @param {number} [corridorCount] @param {number} [corridorWidth] */
export function punchHolesOnDirectedEdge(layout, closedRooms, edgeIndex, rng, corridorCount = 1, corridorWidth = 1) {
    const edge = layout.graphEdges[edgeIndex];
    const { rooms } = layout;
    edge.parentHoles = punchHolesTowardNeighbor(closedRooms[edge.a], rooms[edge.b], rng, corridorCount, corridorWidth);
    edge.childHoles = punchHolesTowardNeighbor(closedRooms[edge.b], rooms[edge.a], rng, corridorCount, corridorWidth);
    edge.parentHole = edge.parentHoles[0];
    edge.childHole = edge.childHoles[0];
    edge.corridorFrom = stepAcrossSide(edge.parentHole, edge.parentHole.side);
    edge.corridorTo = stepAcrossSide(edge.childHole, edge.childHole.side);
}
/** One hole per tree edge touching this node, facing the other endpoint. */
/** @param {RoomGraphLayout} layout @param {ClosedRoom[]} closedRooms @param {number} nodeId @param {() => number} rng @param {number} [corridorCount] @param {number} [corridorWidth] */
export function punchHolesForNodeIncidentEdges(layout, closedRooms, nodeId, rng, corridorCount = 1, corridorWidth = 1) {
    const { graphEdges, rooms } = layout;
    for (let i = 0; i < graphEdges.length; i++) {
        const edge = graphEdges[i];
        if (edge.a === nodeId) {
            edge.parentHoles = punchHolesTowardNeighbor(closedRooms[nodeId], rooms[edge.b], rng, corridorCount, corridorWidth);
            edge.parentHole = edge.parentHoles[0];
            edge.corridorFrom = stepAcrossSide(edge.parentHole, edge.parentHole.side);
        }
        if (edge.b === nodeId) {
            edge.childHoles = punchHolesTowardNeighbor(closedRooms[nodeId], rooms[edge.a], rng, corridorCount, corridorWidth);
            edge.childHole = edge.childHoles[0];
            edge.corridorTo = stepAcrossSide(edge.childHole, edge.childHole.side);
        }
    }
}
/** @param {number} edgeIndex @param {RoomGraphLayout} layout @param {ClosedRoom[]} closedRooms @param {() => number} rng @param {number} originCol @param {number} originRow @param {{ corridorCount?: number, corridorWidth?: number, halfWidth?: number, egressCells?: number, canIntersect?: boolean, existingPaths?: Cell[][], skipPunchIfHolesPresent?: boolean }} [options] */
export function tryBuildCorridorForEdge(edgeIndex, layout, closedRooms, rng, originCol, originRow, options = {}) {
    const corridorCount = options.corridorCount ?? 1;
    const corridorWidth = resolveCorridorWidth(options);
    const egressCells = options.egressCells ?? DEFAULT_CORRIDOR_EGRESS_CELLS;
    const canIntersect = options.canIntersect !== false;
    const existingPaths = options.existingPaths ?? [];
    const skipPunch = options.skipPunchIfHolesPresent === true;
    const { rooms, graphEdges, gridCols, gridRows } = layout;
    const edge = graphEdges[edgeIndex];
    const roomA = closedRooms[edge.a];
    const roomB = closedRooms[edge.b];
    const snapA = snapshotClosedRoom(roomA);
    const snapB = snapshotClosedRoom(roomB);
    const punchedHere = !(skipPunch && edgeHasPunchedHoles(edge, corridorCount));
    if (punchedHere) punchHolesOnDirectedEdge(layout, closedRooms, edgeIndex, rng, corridorCount, corridorWidth);
    else {
        edge.corridorFrom = stepAcrossSide(edge.parentHole, edge.parentHole.side);
        edge.corridorTo = stepAcrossSide(edge.childHole, edge.childHole.side);
    }
    /** @type {Cell[][]} */
    const paths = [];
    /** @type {RailWall[][]} */
    const railLists = [];
    /** @type {Cell[][]} */
    const lanePaths = canIntersect ? [] : existingPaths.slice();
    for (let lane = 0; lane < corridorCount; lane++) {
        const { parentHole, childHole } = edgeHolePairAtLane(edge, lane);
        const path = buildCorridorPathBetweenHoles(parentHole, childHole, rooms, rng, egressCells, { existingPaths: lanePaths, tryAllMidOrders: !canIntersect, corridorWidth });
        if (!path) {
            if (punchedHere) {
                restoreClosedRoom(roomA, snapA);
                restoreClosedRoom(roomB, snapB);
                clearEdgeHoleFields(edge);
            }
            return null;
        }
        const mask = new Uint8Array(gridCols * gridRows);
        stampCorridorTube(mask, gridCols, gridRows, path, corridorWidth);
        const gapKeysWorld = roomWallGapKeysWorld(closedRooms, originCol, originRow);
        railLists.push(omitRailWallsAtGapKeys(railWallsFromFloorMask(mask, gridCols, gridRows, originCol, originRow), gapKeysWorld));
        paths.push(path);
        lanePaths.push(path);
    }
    return { edgeIndex, edge, path: paths[0], paths, railWalls: mergeRailWalls(railLists) };
}
/** Punch + route up to `corridorEdgeCount` tree edges (shuffled order). Shared rooms accumulate holes. */
/** @param {RoomGraphLayout} layout @param {ClosedRoom[]} closedRooms @param {() => number} rng @param {number} originCol @param {number} originRow @param {{ corridorEdgeCount?: number, canIntersect?: boolean, corridorWidth?: number, halfWidth?: number, egressCells?: number }} [options] */
export function tryBuildCorridorRailsForEdges(layout, closedRooms, rng, originCol, originRow, options = {}) {
    const corridorEdgeCount = options.corridorEdgeCount ?? 1;
    const canIntersect = options.canIntersect !== false;
    const { graphEdges } = layout;
    /** @type {number[]} */
    const order = graphEdges.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    /** @type {{ edgeIndex: number, path: Cell[], railWalls: RailWall[] }[]} */
    const built = [];
    /** @type {Cell[][]} */
    const placedPaths = [];
    for (let k = 0; k < order.length && built.length < corridorEdgeCount; k++) {
        const result = tryBuildCorridorForEdge(order[k], layout, closedRooms, rng, originCol, originRow, { ...options, canIntersect, existingPaths: placedPaths });
        if (!result) continue;
        built.push(result);
        placedPaths.push(result.path);
    }
    if (built.length === 0) return null;
    return { edgeIndices: built.map((b) => b.edgeIndex), paths: built.map((b) => b.path), railWalls: mergeRailWalls(built.map((b) => b.railWalls)) };
}
/** @deprecated Use {@link tryBuildCorridorRailsForEdges} with `corridorEdgeCount: 1`. */
export function tryBuildSingleCorridorRails(layout, closedRooms, rng, originCol, originRow, options = {}) {
    const result = tryBuildCorridorRailsForEdges(layout, closedRooms, rng, originCol, originRow, { ...options, corridorEdgeCount: 1 });
    if (!result) return null;
    return { edgeIndex: result.edgeIndices[0], edge: layout.graphEdges[result.edgeIndices[0]], path: result.paths[0], paths: result.paths, railWalls: result.railWalls };
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
/** @param {GraphNode} room @param {RoomPropSpec} spec @param {number} originCol @param {number} originRow @param {number} cellSize */
export function roomPropSpecToSceneProp(room, spec, originCol, originRow, cellSize) {
    const half = cellSize * 0.5;
    const dc = spec.dc ?? 0;
    const dr = spec.dr ?? 0;
    return { type: spec.type, x: (room.centerC + dc + originCol) * cellSize + half, y: (room.centerR + dr + originRow) * cellSize + half, facing: spec.facing ?? 0, faction: spec.faction ?? "alpha" };
}
/** @param {GraphNode} room @param {RoomPropSpec[]} specs @param {number} originCol @param {number} originRow @param {number} cellSize */
export function roomPropSpecsToSceneProps(room, specs, originCol, originRow, cellSize) {
    /** @type {SandboxSceneProp[]} */
    const props = [];
    for (let i = 0; i < specs.length; i++) props.push(roomPropSpecToSceneProp(room, specs[i], originCol, originRow, cellSize));
    return props;
}
/** @param {RoomGraphLayout} layout @param {number} originCol @param {number} originRow @param {number} [cellSize] */
export function propsForRoomCenters(layout, originCol, originRow, cellSize = DEFAULT_SANDBOX_GRAPH_CELL_SIZE) {
    /** @type {SandboxSceneProp[]} */
    const props = [];
    for (let i = 0; i < layout.rooms.length; i++) props.push(roomPropSpecToSceneProp(layout.rooms[i], { type: ROOM_PROP_TYPES[i % ROOM_PROP_TYPES.length] }, originCol, originRow, cellSize));
    return props;
}
/** @param {RoomGraphBuildCtx} ctx @param {GraphNode} room @param {RoomPropSpec[]} specs */
function pushRoomProps(ctx, room, specs) {
    ctx.props.push(...roomPropSpecsToSceneProps(room, specs, ctx.originCol, ctx.originRow, ctx.cellSize));
}
/** @param {SpawnPropsInNodeMotif} motif @param {RoomGraphBuildCtx} ctx */
function runSpawnPropsInNodeMotif(motif, ctx) {
    const room = ctx.layout.rooms[motif.nodeId];
    pushRoomProps(ctx, room, motif.props);
}
/** @param {RoomGraphRoomMotif} roomMotif @param {RoomGraphBuildCtx} ctx @param {ClosedRoom} closedRoom */
function runRoomGraphRoomMotif(roomMotif, ctx, closedRoom) {
    if (roomMotif.op === "punchHoleInClosedRoom") {
        punchHoleInClosedRoom(closedRoom, ctx.holeRng);
        return;
    }
    if (roomMotif.op === "spawnProps") {
        pushRoomProps(ctx, closedRoom.node, roomMotif.props);
        return;
    }
    throw new Error(`Unknown room graph room motif op: ${roomMotif.op}`);
}
/** @param {ClosedRoom[]} closedRooms @param {RoomGraphRoomMotif} roomMotif @param {RoomGraphBuildCtx} ctx */
function forEachRoomRunRoomMotif(closedRooms, roomMotif, ctx) {
    for (let i = 0; i < closedRooms.length; i++) runRoomGraphRoomMotif(roomMotif, ctx, closedRooms[i]);
}
/** @param {number} count @param {() => number} rng */
function shuffledIndices(count, rng) {
    /** @type {number[]} */
    const order = [];
    for (let i = 0; i < count; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    return order;
}
/** @param {RoomGraphEdgeMotif} edgeMotif @param {RoomGraphBuildCtx} ctx @param {number} edgeIndex @param {{ canIntersect?: boolean, corridorCount?: number, corridorWidth?: number }} forEachOpts @returns {boolean} */
function runRoomGraphEdgeMotif(edgeMotif, ctx, edgeIndex, forEachOpts) {
    if (edgeMotif.op === "punchHolesTowardNeighbors") {
        punchHolesOnDirectedEdge(ctx.layout, ctx.closedRooms, edgeIndex, ctx.holeRng);
        return true;
    }
    if (edgeMotif.op === "buildCorridorForEdge") {
        const canIntersect = edgeMotif.canIntersect ?? forEachOpts.canIntersect ?? true;
        const corridorCount = edgeMotif.corridorCount ?? forEachOpts.corridorCount ?? 1;
        const corridorWidth = edgeMotif.corridorWidth ?? forEachOpts.corridorWidth;
        const result = tryBuildCorridorForEdge(edgeIndex, ctx.layout, ctx.closedRooms, ctx.corridorRng, ctx.originCol, ctx.originRow, {
            canIntersect,
            corridorCount,
            corridorWidth,
            existingPaths: ctx.corridorPaths,
            skipPunchIfHolesPresent: edgeMotif.skipPunchIfHolesPresent === true,
        });
        if (!result) return false;
        const builtPaths = result.paths ?? [result.path];
        for (let pi = 0; pi < builtPaths.length; pi++) {
            ctx.corridorEdgeIndices.push(result.edgeIndex);
            ctx.corridorPaths.push(builtPaths[pi]);
        }
        ctx.corridorRails.push(...result.railWalls);
        return true;
    }
    throw new Error(`Unknown room graph edge motif op: ${edgeMotif.op}`);
}
/** @param {{ a: number, b: number }[]} treeEdges @param {number} nodeCount */
function nodeDepthFromRoot(treeEdges, nodeCount) {
    const children = childrenMapFromTreeEdges(treeEdges, nodeCount);
    const depth = new Int32Array(nodeCount);
    /** @type {number[]} */
    const queue = [0];
    for (let qi = 0; qi < queue.length; qi++) {
        const id = queue[qi];
        const kids = children[id];
        for (let i = 0; i < kids.length; i++) {
            const kid = kids[i];
            depth[kid] = depth[id] + 1;
            queue.push(kid);
        }
    }
    return depth;
}
/** @param {ForEachEdgeMotif} motif @param {RoomGraphBuildCtx} ctx */
function runForEachEdgeMotif(motif, ctx) {
    const { graphEdges, treeEdges, rooms } = ctx.layout;
    /** @type {number[]} */
    let order;
    if (motif.shuffle === false) {
        const depth = nodeDepthFromRoot(treeEdges, rooms.length);
        order = graphEdges.map((_, i) => i).sort((a, b) => depth[graphEdges[b].b] - depth[graphEdges[a].b]);
    } else order = shuffledIndices(graphEdges.length, ctx.corridorRng);
    const limit = motif.limit ?? graphEdges.length;
    let okCount = 0;
    for (let k = 0; k < order.length && okCount < limit; k++)
        if (runRoomGraphEdgeMotif(motif.run, ctx, order[k], { canIntersect: motif.canIntersect, corridorCount: motif.corridorCount, corridorWidth: motif.corridorWidth })) okCount++;
    if (motif.requireAll && okCount < limit) throw new Error(`forEachEdge: completed ${okCount}/${limit}`);
}
/** @param {RoomGraphNodeMotif} nodeMotif @param {RoomGraphBuildCtx} ctx @param {number} nodeId @param {{ corridorCount?: number, corridorWidth?: number }} forEachOpts */
function runRoomGraphNodeMotif(nodeMotif, ctx, nodeId, forEachOpts) {
    if (nodeMotif.op === "punchHolePerIncidentEdge") {
        const corridorCount = nodeMotif.corridorCount ?? forEachOpts.corridorCount ?? 1;
        const corridorWidth = resolveCorridorWidth({ corridorWidth: nodeMotif.corridorWidth ?? forEachOpts.corridorWidth });
        punchHolesForNodeIncidentEdges(ctx.layout, ctx.closedRooms, nodeId, ctx.holeRng, corridorCount, corridorWidth);
        return;
    }
    throw new Error(`Unknown room graph node motif op: ${nodeMotif.op}`);
}
/** @param {ForEachNodeMotif} motif @param {RoomGraphBuildCtx} ctx */
function runForEachNodeMotif(motif, ctx) {
    for (let i = 0; i < ctx.layout.rooms.length; i++) runRoomGraphNodeMotif(motif.run, ctx, i, { corridorCount: motif.corridorCount, corridorWidth: motif.corridorWidth });
}
/** @param {ValidateLayoutMotif} motif @param {RoomGraphBuildCtx} ctx @returns {string} empty when valid */
export function describeLayoutValidationFailure(motif, ctx) {
    /** @type {string[]} */
    const parts = [];
    const config = resolveNodeGraphGenConfig(ctx.options);
    const minNodes = motif.minNodes ?? config.nodeCount ?? config.minNodes;
    const corridorCount = motif.corridorCount ?? 1;
    const corridorWidth = resolveCorridorWidth({ corridorWidth: motif.corridorWidth });
    const edgeCount = ctx.layout.graphEdges.length;
    if (ctx.layout.rooms.length < minNodes) parts.push(`rooms ${ctx.layout.rooms.length}/${minNodes}`);
    if (motif.allTreeEdgesRouted && ctx.corridorPaths.length < edgeCount * corridorCount) parts.push(`corridors ${ctx.corridorPaths.length}/${edgeCount * corridorCount}`);
    if (motif.corridorsAtLeast != null && ctx.corridorPaths.length < motif.corridorsAtLeast) parts.push(`corridors ${ctx.corridorPaths.length}/${motif.corridorsAtLeast}`);
    if (motif.corridorsIntersect === false)
        for (let i = 0; i < ctx.corridorPaths.length; i++)
            for (let j = i + 1; j < ctx.corridorPaths.length; j++)
                if (corridorPathIntersectsAny(ctx.corridorPaths[i], [ctx.corridorPaths[j]], corridorWidth)) {
                    parts.push("corridor paths intersect");
                    break;
                }
    return parts.join("; ");
}
/** @param {ValidateLayoutMotif} motif @param {RoomGraphBuildCtx} ctx */
export function validateLayoutPasses(motif, ctx) {
    return describeLayoutValidationFailure(motif, ctx) === "";
}
/** @param {Record<string, unknown>} options @returns {RoomGraphBuildCtx} */
function createEmptyRoomGraphBuildCtx(options) {
    return {
        options,
        layout: /** @type {RoomGraphLayout} */ (/** @type {unknown} */ (null)),
        closedRooms: /** @type {ClosedRoom[]} */ (/** @type {unknown} */ (null)),
        corridorRails: [],
        corridorPaths: [],
        corridorEdgeIndices: [],
        props: [],
        originCol: 0,
        originRow: 0,
        cellSize: DEFAULT_SANDBOX_GRAPH_CELL_SIZE,
        corridorRng: createSeededRng(0),
        holeRng: createSeededRng(0),
    };
}
/** @param {RetryUntilMotif} motif @param {Record<string, unknown>} options */
function runRetryUntilMotif(motif, options) {
    const base = resolveNodeGraphGenConfig(options);
    const maxAttempts = motif.maxAttempts ?? base.layoutMaxAttempts;
    let lastReason = "unknown";
    for (let attempt = 0; attempt < maxAttempts; attempt++)
        try {
            const ctx = createEmptyRoomGraphBuildCtx({ ...options, seed: base.seed + attempt, layoutMaxAttempts: 1, maxAttempts: 1 });
            for (let i = 0; i < motif.body.length; i++) runRoomGraphMotif(motif.body[i], ctx);
            if (validateLayoutPasses(motif.until, ctx)) return ctx;
            lastReason = describeLayoutValidationFailure(motif.until, ctx);
        } catch (err) {
            lastReason = err instanceof Error ? err.message : String(err);
        }
    throw new Error(`retryUntil failed after ${maxAttempts} attempts: ${lastReason}`);
}
/** @param {RoomGraphMotif} motif @param {RoomGraphBuildCtx} ctx */
function runRoomGraphMotif(motif, ctx) {
    if (motif.op === "buildNodeGraph") {
        const { op, ...graphParams } = motif;
        ctx.options = { ...ctx.options, ...graphParams };
        const nodeGraph = tryBuildNodeGraph(ctx.options);
        ctx.layout = layoutFromNodeGraph(nodeGraph, []);
        ctx.closedRooms = ctx.layout.closedRooms;
        const origin = roomGraphOrigin(ctx.layout.gridCols, ctx.layout.gridRows);
        ctx.originCol = origin.originCol;
        ctx.originRow = origin.originRow;
        ctx.corridorRng = createSeededRng(ctx.layout.seed + 99991);
        ctx.holeRng = createSeededRng(ctx.layout.seed + 31337);
        return;
    }
    if (motif.op === "buildClosedRooms") {
        ctx.closedRooms = buildRoomsFromNodeGraph(ctx.layout.nodeGraph);
        ctx.layout.closedRooms = ctx.closedRooms;
        return;
    }
    if (motif.op === "forEachRoom") {
        forEachRoomRunRoomMotif(ctx.closedRooms, motif.run, ctx);
        return;
    }
    if (motif.op === "forEachEdge") {
        runForEachEdgeMotif(motif, ctx);
        return;
    }
    if (motif.op === "forEachNode") {
        runForEachNodeMotif(motif, ctx);
        return;
    }
    if (motif.op === "validateLayout") {
        const reason = describeLayoutValidationFailure(motif, ctx);
        if (reason) throw new Error(`validateLayout failed: ${reason}`);
        return;
    }
    if (motif.op === "punchOneHolePerRoom") {
        forEachRoomRunRoomMotif(ctx.closedRooms, { op: "punchHoleInClosedRoom" }, ctx);
        return;
    }
    if (motif.op === "buildCorridors") {
        const corridor = tryBuildCorridorRailsForEdges(ctx.layout, ctx.closedRooms, ctx.corridorRng, ctx.originCol, ctx.originRow, {
            corridorEdgeCount: motif.corridorEdgeCount ?? 1,
            canIntersect: motif.canIntersect !== false,
        });
        const want = motif.corridorEdgeCount ?? 1;
        if (!corridor) {
            if (motif.requireAll) throw new Error(`buildCorridors: could not place any of ${want} corridors`);
            return;
        }
        if (motif.requireAll && corridor.edgeIndices.length < want) throw new Error(`buildCorridors: placed ${corridor.edgeIndices.length}/${want}`);
        ctx.corridorEdgeIndices.push(...corridor.edgeIndices);
        ctx.corridorPaths.push(...corridor.paths);
        ctx.corridorRails.push(...corridor.railWalls);
        return;
    }
    if (motif.op === "buildAllCorridors") {
        const corridor = tryBuildCorridorRailsForEdges(ctx.layout, ctx.closedRooms, ctx.corridorRng, ctx.originCol, ctx.originRow, {
            corridorEdgeCount: ctx.layout.graphEdges.length,
            canIntersect: motif.canIntersect !== false,
        });
        if (!corridor) {
            if (motif.requireAll) throw new Error("buildAllCorridors: routing failed");
            return;
        }
        if (motif.requireAll && corridor.edgeIndices.length < ctx.layout.graphEdges.length) throw new Error(`buildAllCorridors: placed ${corridor.edgeIndices.length}/${ctx.layout.graphEdges.length}`);
        ctx.corridorEdgeIndices.push(...corridor.edgeIndices);
        ctx.corridorPaths.push(...corridor.paths);
        ctx.corridorRails.push(...corridor.railWalls);
        return;
    }
    if (motif.op === "spawnPropsInNode") {
        runSpawnPropsInNodeMotif(motif, ctx);
        return;
    }
    if (motif.op === "spawnPropsPerRoom") {
        ctx.props.push(...propsForRoomCenters(ctx.layout, ctx.originCol, ctx.originRow, ctx.cellSize));
        return;
    }
    throw new Error(`Unknown room graph motif op: ${motif.op}`);
}
/** Run an ordered motif list; throws on unknown ops or unmet requireAll. */
/** @param {RoomGraphMotif[]} motifs @param {Record<string, unknown>} [options] */
export function runRoomGraphMotifs(motifs, options = {}) {
    if (!Array.isArray(motifs) || motifs.length === 0) throw new Error("motifs must be a non-empty array");
    if (motifs.length === 1 && motifs[0].op === "retryUntil") return runRetryUntilMotif(motifs[0], options);
    const ctx = createEmptyRoomGraphBuildCtx(options);
    for (let i = 0; i < motifs.length; i++) {
        const motif = motifs[i];
        if (motif.op === "retryUntil") throw new Error("retryUntil must be the sole top-level motif");
        runRoomGraphMotif(motif, ctx);
    }
    return ctx;
}
/** @param {RoomGraphLayout} layout @param {{ originCol: number, originRow: number, cellSize?: number, props?: SandboxSceneProp[], corridorRails?: RailWall[], corridorPaths?: Cell[][], corridorEdgeIndices?: number[], motifs?: RoomGraphMotif[] }} options */
export function roomGraphLayoutToSceneDoc(layout, options) {
    const cellSize = options.cellSize ?? DEFAULT_SANDBOX_GRAPH_CELL_SIZE;
    const { originCol, originRow } = options;
    const closedRooms = layout.closedRooms ?? buildRoomsFromNodeGraph(layout.nodeGraph);
    const corridorRails = options.corridorRails ?? [];
    const corridorPaths = options.corridorPaths ?? [];
    const corridorEdgeIndices = options.corridorEdgeIndices ?? [];
    const roomRails = railWallsForClosedRooms(closedRooms, originCol, originRow);
    const gapKeysWorld = roomWallGapKeysWorld(closedRooms, originCol, originRow);
    const props = options.props ?? [];
    const scenePad = 48;
    const cols = Math.max(layout.gridCols + scenePad, NODE_GRAPH_GRID_MIN);
    const rows = Math.max(layout.gridRows + scenePad, NODE_GRAPH_GRID_MIN);
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize,
        origin: { minX: -1200, minY: -1200 },
        cols,
        rows,
        voxels: [],
        railWalls: mergeRailWalls([roomRails, omitRailWallsAtGapKeys(corridorRails, gapKeysWorld)]),
        forcefields: [],
        portals: [],
        floorBelts: [],
        powerSources: [],
        props,
        meta: {
            generator: "roomGraph",
            seed: layout.seed,
            motifs: options.motifs,
            corridorEdgeIndices,
            rooms: layout.rooms.map((r) => ({ id: r.id, c0: r.c0, c1: r.c1, r0: r.r0, r1: r.r1, centerC: r.centerC, centerR: r.centerR, width: r.width, height: r.height })),
            edges: layout.graphEdges,
            corridors: corridorPaths.map((path, i) => ({ edge: corridorEdgeIndices[i] ?? i, length: path.length, from: path[0], to: path[path.length - 1] })),
        },
    };
}
/** @param {Record<string, unknown>} [options] */
export function buildSandboxRoomGraphSceneDoc(options = {}) {
    const motifs = /** @type {RoomGraphMotif[]} */ (options.motifs ?? DEFAULT_SANDBOX_GRAPH_MOTIFS);
    const ctx = runRoomGraphMotifs(motifs, options);
    return roomGraphLayoutToSceneDoc(ctx.layout, {
        originCol: ctx.originCol,
        originRow: ctx.originRow,
        props: ctx.props,
        corridorRails: ctx.corridorRails,
        corridorPaths: ctx.corridorPaths,
        corridorEdgeIndices: ctx.corridorEdgeIndices,
        motifs,
    });
}
/**
 * @param {Record<string, unknown>} [options]
 * @returns {{ ok: true, doc: ReturnType<typeof roomGraphLayoutToSceneDoc> } | { ok: false, reason: string }}
 */
export function tryBuildSandboxRoomGraphSceneDoc(options = {}) {
    const motifs = options.motifs ?? DEFAULT_SANDBOX_GRAPH_MOTIFS;
    const validation = validateRoomGraphMotifs(motifs);
    if (!validation.ok) {
        const reason = validation.errors.map((err) => (err.path ? `${err.path}: ${err.message}` : err.message)).join("; ");
        return { ok: false, reason };
    }
    try {
        return { ok: true, doc: buildSandboxRoomGraphSceneDoc(options) };
    } catch (err) {
        return { ok: false, reason: err instanceof Error ? err.message : String(err) };
    }
}
