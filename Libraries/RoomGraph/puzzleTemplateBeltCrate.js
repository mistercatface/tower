import { forEachDenseCellInRect } from "../DataStructures/CellRect.js";
import { createSeededRng } from "../Math/SeededRng.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { PUZZLE_TEMPLATE_BALL_TINTS } from "../Color/visualOverride.js";
import { spawnPlacedSandboxProp } from "../Sandbox/sandboxPlacedSpawn.js";
import { buildRoomsFromNodeGraph } from "./roomGraphClosedRooms.js";
import { applyCorridorBundleToRooms, solveAuthoredLinkCorridorBundle } from "./roomGraphCorridorApply.js";
import { CORRIDOR_TYPE_CONVEYOR_ONE_WAY, CORRIDOR_TYPE_LOCKED_ROOM } from "./roomGraphCorridorTypes.js";
import { expandGridForRoomNodeFootprint, syncRoomGraphBake } from "./roomGraphBake.js";
import { canStampRoomNodeAt, stampRoomNodeAt } from "./roomGraphPlacement.js";
import { addRoomLink, getRoomGraph, listRoomNodes, removeRoomNode, roomNodeCenterCell } from "./roomGraphStore.js";
export const BELT_CRATE_PUZZLE_MIN_AREA_COLS = 28;
export const BELT_CRATE_PUZZLE_MIN_AREA_ROWS = 24;
export const BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS = 48;
export const BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS = 40;
const ROOM_COUNT = 3;
const MIN_ROOM_SIZE = 6;
const MAX_ROOM_SIZE = 10;
const ROOM_GAP = 3;
const CORRIDOR_WIDTH = 1;
const STAMP_ATTEMPTS = 64;
const PLACE_ATTEMPTS_PER_ROOM = 48;
/** @param {() => number} rng */
function shuffleIndices(length, rng) {
    const order = [];
    for (let i = 0; i < length; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    return order;
}
/** @param {{ col: number, row: number, width: number, height: number }} a @param {{ col: number, row: number, width: number, height: number }} b @param {number} gap */
function roomRectsOverlap(a, b, gap) {
    return a.col < b.col + b.width + gap && a.col + a.width + gap > b.col && a.row < b.row + b.height + gap && a.row + a.height + gap > b.row;
}
/** @param {() => number} rng */
function rollRoomSize(rng) {
    return MIN_ROOM_SIZE + Math.floor(rng() * (MAX_ROOM_SIZE - MIN_ROOM_SIZE + 1));
}
/** @param {import("./roomGraphStore.js").RoomNode} spec */
function roomNodeToGraphNode(spec) {
    const c0 = spec.col;
    const r0 = spec.row;
    const c1 = spec.col + spec.width - 1;
    const r1 = spec.row + spec.height - 1;
    return { id: spec.id, c0, c1, r0, r1, centerC: (c0 + (spec.width - 1) / 2) | 0, centerR: (r0 + (spec.height - 1) / 2) | 0, width: spec.width, height: spec.height };
}
/**
 * @param {object} state
 * @param {number} areaCol
 * @param {number} areaRow
 * @param {number} areaCols
 * @param {number} areaRows
 * @param {() => number} rng
 * @returns {{ col: number, row: number, width: number, height: number }[] | null}
 */
export function rollBeltCrateRoomLayout(state, areaCol, areaRow, areaCols, areaRows, rng) {
    /** @type {({ col: number, row: number, width: number, height: number } | null)[]} */
    const specs = [null, null, null];
    const order = shuffleIndices(ROOM_COUNT, rng);
    for (let oi = 0; oi < order.length; oi++) {
        const roomIndex = order[oi];
        const width = rollRoomSize(rng);
        const height = rollRoomSize(rng);
        if (width > areaCols || height > areaRows) return null;
        let placed = false;
        for (let attempt = 0; attempt < PLACE_ATTEMPTS_PER_ROOM; attempt++) {
            const col = areaCol + Math.floor(rng() * (areaCols - width + 1));
            const row = areaRow + Math.floor(rng() * (areaRows - height + 1));
            const candidate = { col, row, width, height };
            let clash = false;
            for (let ri = 0; ri < ROOM_COUNT; ri++) {
                const other = specs[ri];
                if (!other) continue;
                if (roomRectsOverlap(candidate, other, ROOM_GAP)) {
                    clash = true;
                    break;
                }
            }
            if (clash) continue;
            if (!canStampRoomNodeAt(state, col, row, width, height)) continue;
            specs[roomIndex] = candidate;
            placed = true;
            break;
        }
        if (!placed) return null;
    }
    return specs;
}
/**
 * @param {object} state
 * @param {{ col: number, row: number, width: number, height: number }[]} roomSpecs
 * @param {{ a: number, b: number, seed: number }[]} linkPlan
 */
export function probeBeltCrateCorridorLayout(state, roomSpecs, linkPlan) {
    const existing = listRoomNodes(state);
    /** @type {import("./roomGraphClosedRooms.js").GraphNode[]} */
    const graphNodes = [];
    const indexById = new Map();
    for (let i = 0; i < existing.length; i++) {
        graphNodes.push(roomNodeToGraphNode(existing[i]));
        indexById.set(existing[i].id, i);
    }
    for (let i = 0; i < roomSpecs.length; i++) {
        const probeId = 100000 + i;
        graphNodes.push(roomNodeToGraphNode({ id: probeId, ...roomSpecs[i] }));
        indexById.set(probeId, graphNodes.length - 1);
    }
    const closedRooms = buildRoomsFromNodeGraph({ nodes: graphNodes, directedEdges: [] });
    const placedPaths = [];
    const placedPathWidths = [];
    for (let li = 0; li < linkPlan.length; li++) {
        const link = linkPlan[li];
        const a = indexById.get(link.a);
        const b = indexById.get(link.b);
        const bundle = solveAuthoredLinkCorridorBundle(graphNodes[a], graphNodes[b], graphNodes, [CORRIDOR_WIDTH], createSeededRng(link.seed), {
            existingPaths: placedPaths,
            existingPathWidths: placedPathWidths,
        });
        if (!bundle) return false;
        applyCorridorBundleToRooms(bundle, closedRooms[a], closedRooms[b]);
        for (let pi = 0; pi < bundle.paths.length; pi++) {
            placedPaths.push(bundle.paths[pi]);
            placedPathWidths.push(bundle.corridorWidths[pi]);
        }
    }
    return true;
}
/** @param {object} state @param {number} areaCol @param {number} areaRow @param {number} areaCols @param {number} areaRows @param {number} [corridorMargin] */
export function expandGridForPuzzleTemplateArea(state, areaCol, areaRow, areaCols, areaRows, corridorMargin = 16) {
    const anchorCol = areaCol - corridorMargin;
    const anchorRow = areaRow - corridorMargin;
    const width = areaCols + corridorMargin * 2;
    const height = areaRows + corridorMargin * 2;
    expandGridForRoomNodeFootprint(state, anchorCol, anchorRow, width, height);
}
/** @param {object} state @param {import("./roomGraphStore.js").RoomNode} room */
function spawnBeltCratePuzzleProps(state, room) {
    const grid = state.obstacleGrid;
    const center = roomNodeCenterCell(room);
    const ballA = grid.gridToWorld(center.col - 1, center.row);
    const ballB = grid.gridToWorld(center.col + 1, center.row);
    spawnPlacedSandboxProp(state, ballA.x, ballA.y, "ball", undefined, 0, undefined, { tint: PUZZLE_TEMPLATE_BALL_TINTS.roomA });
    spawnPlacedSandboxProp(state, ballB.x, ballB.y, "ball", undefined, 0, undefined, { tint: PUZZLE_TEMPLATE_BALL_TINTS.roomB });
}
/** @param {object} state @param {number} linkId */
function lockedBakeForLink(state, linkId) {
    const bakes = getRoomGraph(state).bakedLockedRooms ?? [];
    for (let i = 0; i < bakes.length; i++) if (bakes[i].linkId === linkId) return bakes[i];
    return null;
}
/** @param {object} state @param {number[]} nodeIds */
function removePuzzleStampNodes(state, nodeIds) {
    for (let i = 0; i < nodeIds.length; i++) removeRoomNode(state, nodeIds[i]);
    syncRoomGraphBake(state);
}
/**
 * @param {object} state
 * @param {number} areaCol
 * @param {number} areaRow
 * @param {number} areaCols
 * @param {number} areaRows
 * @param {() => number} [rng]
 */
export function stampBeltCratePuzzleAt(state, areaCol, areaRow, areaCols, areaRows, rng = Math.random) {
    if (areaCols < BELT_CRATE_PUZZLE_MIN_AREA_COLS || areaRows < BELT_CRATE_PUZZLE_MIN_AREA_ROWS) return null;
    const grid = state.obstacleGrid;
    if (!cellInRect(areaCol, areaRow, grid.cols, grid.rows)) return null;
    if (!cellInRect(areaCol + areaCols - 1, areaRow + areaRows - 1, grid.cols, grid.rows)) return null;
    expandGridForPuzzleTemplateArea(state, areaCol, areaRow, areaCols, areaRows);
    for (let attempt = 0; attempt < STAMP_ATTEMPTS; attempt++) {
        const layout = rollBeltCrateRoomLayout(state, areaCol, areaRow, areaCols, areaRows, rng);
        if (!layout) continue;
        const seedAB = (rng() * 0xffffffff) | 0;
        const seedBA = (rng() * 0xffffffff) | 0;
        const seedBC = (rng() * 0xffffffff) | 0;
        const probePlan = [
            { a: 100000, b: 100001, seed: seedAB },
            { a: 100001, b: 100000, seed: seedBA },
            { a: 100001, b: 100002, seed: seedBC },
        ];
        if (!probeBeltCrateCorridorLayout(state, layout, probePlan)) continue;
        const roomA = stampRoomNodeAt(state, layout[0].col, layout[0].row, layout[0].width, layout[0].height);
        const roomB = stampRoomNodeAt(state, layout[1].col, layout[1].row, layout[1].width, layout[1].height);
        const roomC = stampRoomNodeAt(state, layout[2].col, layout[2].row, layout[2].width, layout[2].height);
        const linkAB = addRoomLink(state, roomA.id, roomB.id, { corridorType: CORRIDOR_TYPE_CONVEYOR_ONE_WAY, corridorWidthMin: CORRIDOR_WIDTH, corridorWidthMax: CORRIDOR_WIDTH, seed: seedAB });
        const linkBA = addRoomLink(state, roomB.id, roomA.id, { corridorType: CORRIDOR_TYPE_CONVEYOR_ONE_WAY, corridorWidthMin: CORRIDOR_WIDTH, corridorWidthMax: CORRIDOR_WIDTH, seed: seedBA });
        const linkBC = addRoomLink(state, roomB.id, roomC.id, { corridorType: CORRIDOR_TYPE_LOCKED_ROOM, corridorWidthMin: CORRIDOR_WIDTH, corridorWidthMax: CORRIDOR_WIDTH, seed: seedBC });
        syncRoomGraphBake(state);
        if (!lockedBakeForLink(state, linkBC.id)) {
            removePuzzleStampNodes(state, [roomA.id, roomB.id, roomC.id]);
            continue;
        }
        spawnBeltCratePuzzleProps(state, roomA);
        return { roomA, roomB, roomC, links: [linkAB, linkBA, linkBC] };
    }
    return null;
}
/** @param {object} state @param {number} anchorCol @param {number} anchorRow @param {number} areaCols @param {number} areaRows */
export function resolveBeltCratePuzzlePlacePreview(state, anchorCol, anchorRow, areaCols, areaRows) {
    const grid = state.obstacleGrid;
    /** @type {{ col: number, row: number, clear: boolean }[]} */
    const cells = [];
    let valid = areaCols >= BELT_CRATE_PUZZLE_MIN_AREA_COLS && areaRows >= BELT_CRATE_PUZZLE_MIN_AREA_ROWS;
    if (!cellInRect(anchorCol, anchorRow, grid.cols, grid.rows)) valid = false;
    if (!cellInRect(anchorCol + areaCols - 1, anchorRow + areaRows - 1, grid.cols, grid.rows)) valid = false;
    forEachDenseCellInRect(anchorCol, anchorCol + areaCols - 1, anchorRow, anchorRow + areaRows - 1, grid.cols, (col, row) => {
        const inGrid = cellInRect(col, row, grid.cols, grid.rows);
        if (!inGrid) valid = false;
        cells.push({ col, row, clear: inGrid });
    });
    return { kind: "cellRect", anchorCol, anchorRow, width: areaCols, height: areaRows, cells, valid, tint: "puzzle" };
}
