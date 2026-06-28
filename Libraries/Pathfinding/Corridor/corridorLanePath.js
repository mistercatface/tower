import { gridSideNeighborCell, layoutAbsCellIndex, layoutIndexToAbsColRow } from "../../Spatial/grid/GridUtils.js";
import { corridorPathHitsOccupied, corridorPathIntersectsPaths, corridorPathOccupiedCellIndices, corridorPathsToOccupiedCellIndices } from "./corridorFootprint.js";
import { CorridorGridPathfinder } from "./corridorGridPathfinder.js";
import { buildRoomInteriorBlockedGridForLayout, corridorSearchBounds, corridorSearchLayout } from "./corridorWalkGrid.js";
/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */
/** @param {RoomRect[]} rooms @param {number} [pad] */
export function createCorridorLaneRouter(rooms, pad = 12) {
    const bounds = corridorSearchBounds(rooms, pad);
    const layout = corridorSearchLayout(bounds);
    const pathfinder = new CorridorGridPathfinder(layout);
    const roomBlocked = buildRoomInteriorBlockedGridForLayout(layout, rooms);
    pathfinder.setRoomBlocked(roomBlocked);
    return { pathfinder, layout, roomBlocked };
}
/** @param {CorridorCell} cell @param {number} side */
function stepAcrossSide(cell, side) {
    const n = gridSideNeighborCell(cell.c, cell.r, side);
    return { c: n.col, r: n.row };
}
/** @param {CorridorCell} from @param {number} parentSide @param {number} maxSteps @param {RoomRect[]} rooms */
function walkEgress(from, parentSide, maxSteps, rooms) {
    /** @type {CorridorCell[]} */
    const cells = [];
    let p = from;
    for (let i = 0; i < maxSteps; i++) {
        const next = stepAcrossSide(p, parentSide);
        if (cellInsideAnyRoom(rooms, next.c, next.r)) break;
        p = next;
        cells.push(p);
    }
    return { end: p, cells };
}
/** @param {CorridorCell} corridorFrom @param {{ cells: CorridorCell[] }} egress @param {{ c: number, r: number }[]} midPath */
function assembleCorridorPath(corridorFrom, egress, midPath) {
    /** @type {CorridorCell[]} */
    const path = [corridorFrom];
    for (let i = 0; i < egress.cells.length; i++) path.push(egress.cells[i]);
    for (let i = 1; i < midPath.length; i++) path.push(midPath[i]);
    return path;
}
/**
 * @param {WallHole} parentHole
 * @param {WallHole} childHole
 * @param {RoomRect[]} rooms
 * @param {number} egressCells
 * @param {number} corridorWidth
 * @param {CorridorCell[][]} lanePaths
 * @param {Set<number>} baseOccupied
 * @param {import("./corridorGridPathfinder.js").CorridorGridPathfinder} pathfinder
 * @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout
 * @param {{ maxPathLen?: number, laneWidths?: number[], footprint?: { interiorOnly?: boolean } }} [options]
 * @returns {number[] | null}
 */
export function buildCorridorLanePath(parentHole, childHole, rooms, egressCells, corridorWidth, lanePaths, baseOccupied, pathfinder, layout, options = {}) {
    const footprint = options.footprint;
    const stride = layout.strideCols;
    const roomBlocked = options.roomBlocked ?? buildRoomInteriorBlockedGridForLayout(layout, rooms);
    const stepAcrossSideIdx = (idx, side) => {
        if (side === 0) return idx - stride;
        if (side === 1) return idx + 1;
        if (side === 2) return idx + stride;
        if (side === 3) return idx - 1;
        return idx;
    };
    const parentHoleIdx = layoutAbsCellIndex(layout, parentHole.c, parentHole.r);
    const childHoleIdx = layoutAbsCellIndex(layout, childHole.c, childHole.r);
    const corridorFromIdx = stepAcrossSideIdx(parentHoleIdx, parentHole.side);
    const corridorToIdx = stepAcrossSideIdx(childHoleIdx, childHole.side);
    const approachEndIdx = stepAcrossSideIdx(corridorToIdx, childHole.side);
    const walkEgressIdx = (fromIdx, parentSide, maxSteps) => {
        const cells = [];
        let pIdx = fromIdx;
        for (let i = 0; i < maxSteps; i++) {
            const nextIdx = stepAcrossSideIdx(pIdx, parentSide);
            if (roomBlocked[nextIdx]) break;
            pIdx = nextIdx;
            cells.push(pIdx);
        }
        return { endIdx: pIdx, cells };
    };
    const egress = walkEgressIdx(corridorFromIdx, parentHole.side, egressCells);
    const egressEndIdx = egress.endIdx;
    /** @type {Set<number>} */
    const reserved = new Set(baseOccupied);
    const laneWidths = options.laneWidths ?? lanePaths.map(() => corridorWidth);
    const laneIndices = corridorPathsToOccupiedCellIndices(lanePaths, laneWidths, layout, footprint);
    for (const idx of laneIndices) reserved.add(idx);
    pathfinder.setReservedIndices(reserved);
    const midPath = pathfinder.findPath(egressEndIdx, approachEndIdx, options.maxPathLen ?? 512);
    if (!midPath) return null;
    const path = [corridorFromIdx];
    for (let i = 0; i < egress.cells.length; i++) path.push(egress.cells[i]);
    for (let i = 1; i < midPath.length; i++) path.push(midPath[i]);
    const lastIdx = path[path.length - 1];
    const ingressPath = pathfinder.findPath(lastIdx, corridorToIdx, options.maxPathLen ?? 512);
    if (!ingressPath || ingressPath.length < 2) return null;
    for (let i = 1; i < ingressPath.length; i++) path.push(ingressPath[i]);
    const footprintIndices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, { interiorOnly: false });
    for (const idx of footprintIndices) if (roomBlocked[idx]) return null;
    if (lanePaths.length) if (corridorPathIntersectsPaths(path, corridorWidth, lanePaths, laneWidths, layout, footprint)) return null;
    if (corridorPathHitsOccupied(path, baseOccupied, corridorWidth, layout, footprint)) return null;
    return path;
}
/** @param {CorridorCell[]} path @param {Set<number>} occupied @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function addCorridorPathToOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) occupied.add(idx);
}
/** @param {CorridorCell[]} path @param {Set<number>} occupied @param {number} corridorWidth @param {import("../../Spatial/grid/GridUtils.js").CellIndexLayout} layout @param {{ interiorOnly?: boolean }} [options] */
export function removeCorridorPathFromOccupied(path, occupied, corridorWidth, layout, options = {}) {
    const indices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, options);
    for (const idx of indices) occupied.delete(idx);
}
