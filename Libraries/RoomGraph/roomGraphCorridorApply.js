import { corridorSearchBounds, solveCorridorBundle } from "../Pathfinding/Corridor/index.js";
import { corridorSearchLayout, buildRoomFootprintMaskForLayout, cellInsideAnyRoom } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { collectCorridorPathPointIndices } from "../Pathfinding/Corridor/corridorFootprint.js";
import { gridSideFromCellIdxToNeighborIdx, resolveBeltKindFromSides } from "../Spatial/grid/FloorCell.js";
import { createCellIndexLayout, layoutAbsCellIndex, layoutLocalCellIndex, layoutLocalToAbsCell, gridSideNeighborCell } from "../Spatial/grid/GridUtils.js";
import { edgeMirrorSide } from "../Spatial/grid/gridCellTopology.js";
import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import {
    DEFAULT_RAIL_WALL_HEIGHT_LEVEL,
    DEFAULT_RAIL_WALL_THICKNESS_LEVEL,
    omitRailWallsAtGapKeys,
    resolveRailWallHeightLevel,
    resolveRailWallThicknessLevel,
    roomWallGapKeysWorld,
    applyCorridorHoleGroupsToRooms,
} from "./roomGraphClosedRooms.js";
/** @typedef {import("./roomGraphClosedRooms.js").Cell} Cell */
/** @typedef {import("./roomGraphClosedRooms.js").GraphNode} GraphNode */
/** @typedef {import("./roomGraphClosedRooms.js").RailWall} RailWall */
/** @typedef {import("./roomGraphClosedRooms.js").ClosedRoom} ClosedRoom */
/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ col: number, row: number, kind: number, facingIndex: number }} BakedFloorBelt */
/** @typedef {import("../Spatial/grid/GridUtils.js").CellIndexLayout} CellIndexLayout */
export const DEFAULT_CORRIDOR_EGRESS_CELLS = 2;
/** @param {WallHole} hole */
export function roomInteriorCellFromWallHole(hole) {
    const n = gridSideNeighborCell(hole.c, hole.r, edgeMirrorSide(hole.side));
    return { c: n.col, r: n.row };
}
/** @param {WallHole} hole */
export function corridorExteriorCellFromWallHole(hole) {
    const n = gridSideNeighborCell(hole.c, hole.r, hole.side);
    return { c: n.col, r: n.row };
}
/** @param {number[]} path @param {CellIndexLayout} layout */
export function collapsePathRevisits(path, layout) {
    const out = [];
    const indexByKey = new Map();
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        if (indexByKey.has(pIdx)) out.length = indexByKey.get(pIdx);
        indexByKey.set(pIdx, out.length);
        out.push(pIdx);
    }
    return out;
}
/** @param {number[]} path @param {number} width @param {Uint8Array} roomFootprintMask @param {WallHole | null} parentAnchor @param {WallHole | null} childAnchor @param {CellIndexLayout} layout @returns {Map<number, BakedFloorBelt>} */
export function beltsForPathPolyline(path, width, roomFootprintMask, parentAnchor, childAnchor, layout) {
    const collapsed = collapsePathRevisits(path, layout);
    const byCell = new Map();
    const stride = layout.strideCols;
    for (let i = 0; i < collapsed.length; i++) {
        const pIdx = collapsed[i];
        const prevIdx = i > 0 ? collapsed[i - 1] : undefined;
        const nextIdx = i < collapsed.length - 1 ? collapsed[i + 1] : undefined;
        if (prevIdx !== undefined && pIdx === prevIdx) continue;
        const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, width, false, i, collapsed.length, layout);
        let spec;
        if (prevIdx !== undefined && nextIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else if (nextIdx !== undefined) {
            const exitSide = gridSideFromCellIdxToNeighborIdx(pIdx, nextIdx, stride);
            const entrySide = parentAnchor ? edgeMirrorSide(parentAnchor.side) : edgeMirrorSide(exitSide);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else if (prevIdx !== undefined) {
            const entrySide = gridSideFromCellIdxToNeighborIdx(pIdx, prevIdx, stride);
            const exitSide = childAnchor ? edgeMirrorSide(childAnchor.side) : edgeMirrorSide(entrySide);
            spec = resolveBeltKindFromSides(entrySide, exitSide);
        } else spec = resolveBeltKindFromSides(3, 1);
        for (let ci = 0; ci < cells.length; ci++) {
            const idx = cells[ci];
            if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
            byCell.set(idx, { idx, kind: spec.kind, facingIndex: spec.facingIndex });
        }
    }
    return byCell;
}
/**
 * Belt flow follows path order: link.a room → link.b room (wire pick order).
 * Belts stamp only on corridor cells outside room footprints.
 */
export function buildCorridorBeltsFromPaths(paths, corridorWidths, rooms, parentAnchors, childAnchors, layout) {
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    const byCell = new Map();
    for (let pi = 0; pi < paths.length; pi++) {
        const laneBelts = beltsForPathPolyline(paths[pi], corridorWidths[pi], roomFootprintMask, parentAnchors?.[pi] ?? null, childAnchors?.[pi] ?? null, layout);
        for (const [key, belt] of laneBelts) byCell.set(key, belt);
    }
    return [...byCell.values()].map((belt) => ({ idx: belt.idx, kind: belt.kind, facingIndex: belt.facingIndex }));
}
/** @param {RailWall} wall */
function railWallEdgeKey(wall) {
    return packEdgeCellKey(wall.col, wall.row, wall.side);
}
/** @param {RailWall[]} rails */
function dedupeRailWallsByEdge(rails) {
    /** @type {Set<number>} */
    const seen = new Set();
    /** @type {RailWall[]} */
    const out = [];
    for (let i = 0; i < rails.length; i++) {
        const wall = rails[i];
        const key = railWallEdgeKey(wall);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(wall);
    }
    return out;
}
/** @param {Uint8Array} mask @param {{ originCol: number, originRow: number, cols: number, rows: number }} bounds @param {number[]} path @param {number} corridorWidth @param {Uint8Array} roomFootprintMask */
function stampCorridorTubeLocal(mask, bounds, path, corridorWidth, roomFootprintMask) {
    const layout = createCellIndexLayout(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows);
    for (let i = 0; i < path.length; i++) {
        const pIdx = path[i];
        const prevIdx = i > 0 ? path[i - 1] : undefined;
        const nextIdx = i + 1 < path.length ? path[i + 1] : undefined;
        const cells = collectCorridorPathPointIndices(pIdx, prevIdx, nextIdx, corridorWidth, false, i, path.length, layout);
        for (let ci = 0; ci < cells.length; ci++) {
            const idx = cells[ci];
            if (idx < 0 || idx >= layout.cellCount) continue;
            if (cellInsideAnyRoom(roomFootprintMask, idx)) continue;
            mask[idx] = 1;
        }
    }
}
/** @param {Uint8Array} mask @param {number} cols @param {number} rows @param {number} originCol @param {number} originRow @param {number} heightLevel @param {number} thicknessLevel */
export function railWallsFromFloorMask(mask, cols, rows, originCol, originRow, heightLevel, thicknessLevel) {
    /** @type {RailWall[]} */
    const walls = [];
    const layout = createCellIndexLayout(originCol, originRow, cols, rows);
    /** @param {number} c @param {number} r @param {number} side */
    const push = (c, r, side) => {
        const abs = layoutLocalToAbsCell(layout, c, r);
        walls.push({ col: abs.col, row: abs.row, side, heightLevel, thicknessLevel });
    };
    for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
            if (!mask[layoutLocalCellIndex(layout, c, r)]) continue;
            if (r === 0 || !mask[layoutLocalCellIndex(layout, c, r - 1)]) push(c, r, 0);
            if (c + 1 >= cols || !mask[layoutLocalCellIndex(layout, c + 1, r)]) push(c, r, 1);
            if (r + 1 >= rows || !mask[layoutLocalCellIndex(layout, c, r + 1)]) push(c, r, 2);
            if (c === 0 || !mask[layoutLocalCellIndex(layout, c - 1, r)]) push(c, r, 3);
        }
    return walls;
}
/** @param {Cell[][]} paths @param {{ originCol: number, originRow: number, cols: number, rows: number }} stampBounds @param {number | number[]} corridorWidths @param {Set<number>} gapKeysWorld @param {Uint8Array} roomFootprintMask @param {number} heightLevel @param {number} thicknessLevel */
function corridorRailWallsForPaths(paths, stampBounds, corridorWidths, gapKeysWorld, roomFootprintMask, heightLevel, thicknessLevel) {
    /** @type {RailWall[]} */
    const rails = [];
    const layout = createCellIndexLayout(stampBounds.originCol, stampBounds.originRow, stampBounds.cols, stampBounds.rows);
    for (let pi = 0; pi < paths.length; pi++) {
        const laneMask = new Uint8Array(layout.cellCount);
        const width = Array.isArray(corridorWidths) ? corridorWidths[pi] : corridorWidths;
        stampCorridorTubeLocal(laneMask, stampBounds, paths[pi], width, roomFootprintMask);
        rails.push(...railWallsFromFloorMask(laneMask, stampBounds.cols, stampBounds.rows, stampBounds.originCol, stampBounds.originRow, heightLevel, thicknessLevel));
    }
    return omitRailWallsAtGapKeys(dedupeRailWallsByEdge(rails), gapKeysWorld);
}
/** @param {Cell[][]} paths @param {number[]} corridorWidths @param {GraphNode[]} rooms @param {ClosedRoom[]} closedRooms @param {{ originCol: number, originRow: number, cols: number, rows: number }} stampBounds @param {number} originCol @param {number} originRow @param {number} [railWallHeightLevel] @param {number} [railWallThicknessLevel] */
export function buildCorridorRailWallsFromPaths(
    paths,
    corridorWidths,
    rooms,
    closedRooms,
    stampBounds,
    originCol,
    originRow,
    railWallHeightLevel = DEFAULT_RAIL_WALL_HEIGHT_LEVEL,
    railWallThicknessLevel = DEFAULT_RAIL_WALL_THICKNESS_LEVEL,
) {
    const gapKeysWorld = roomWallGapKeysWorld(closedRooms, originCol, originRow);
    const layout = createCellIndexLayout(stampBounds.originCol, stampBounds.originRow, stampBounds.cols, stampBounds.rows);
    const roomFootprintMask = buildRoomFootprintMaskForLayout(layout, rooms);
    const heightLevel = resolveRailWallHeightLevel(railWallHeightLevel);
    const thicknessLevel = resolveRailWallThicknessLevel(railWallThicknessLevel);
    return corridorRailWallsForPaths(paths, stampBounds, corridorWidths, gapKeysWorld, roomFootprintMask, heightLevel, thicknessLevel);
}
export function applyCorridorBundleToRooms(bundle, roomA, roomB) {
    applyCorridorHoleGroupsToRooms(roomA, roomB, bundle.parentHoleGroups, bundle.childHoleGroups);
}
export function stampCorridorBundleRails(bundle, rooms, closedRooms, originCol, originRow, railWallHeightLevel, railWallThicknessLevel) {
    const stampBounds = bundle.layout
        ? { originCol: bundle.layout.originCol, originRow: bundle.layout.originRow, cols: bundle.layout.strideCols, rows: bundle.layout.cellCount / bundle.layout.strideCols }
        : corridorSearchBounds(rooms, DEFAULT_CORRIDOR_EGRESS_CELLS + 6);
    return buildCorridorRailWallsFromPaths(bundle.paths, bundle.corridorWidths, rooms, closedRooms, stampBounds, originCol, originRow, railWallHeightLevel, railWallThicknessLevel);
}
export function stampCorridorBundleBelts(bundle, rooms) {
    const layout = bundle.layout ?? corridorSearchLayout(corridorSearchBounds(rooms, DEFAULT_CORRIDOR_EGRESS_CELLS + 6));
    return buildCorridorBeltsFromPaths(bundle.paths, bundle.corridorWidths, rooms, bundle.parentAnchors, bundle.childAnchors, layout);
}
export function solveAuthoredLinkCorridorBundle(roomA, roomB, allRooms, corridorWidths, rng, options) {
    return solveCorridorBundle({
        roomA,
        roomB,
        allRooms,
        corridorWidths,
        egressCells: DEFAULT_CORRIDOR_EGRESS_CELLS,
        existingPaths: options.existingPaths ?? [],
        existingPathWidths: options.existingPathWidths ?? [],
        rng,
    });
}
