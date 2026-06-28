import { gridSideNeighborCell, layoutAbsCellIndex, layoutIndexToAbsColRow } from "../../Spatial/grid/GridUtils.js";
import { corridorPathHitsOccupied, corridorPathIntersectsPaths, corridorPathOccupiedCellIndices, corridorPathsToOccupiedCellIndices } from "./corridorFootprint.js";
import { CorridorGridPathfinder } from "./corridorGridPathfinder.js";
import { buildRoomInteriorBlockedGridForLayout, cellInsideAnyRoom, corridorSearchBounds, corridorSearchLayout } from "./corridorWalkGrid.js";
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
 * @param {{ maxPathLen?: number, laneWidths?: number[], footprint?: { interiorOnly?: boolean }, roomBlocked?: Uint8Array }} [options]
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
            if (cellInsideAnyRoom(rooms, nextIdx, layout)) break;
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
    const path = [corridorFromIdx];
    for (let i = 0; i < egress.cells.length; i++) path.push(egress.cells[i]);
    const lastIdx = path.length ? path[path.length - 1] : egressEndIdx;
    const midPath = pathfinder.findPath(lastIdx, approachEndIdx, options.maxPathLen ?? 512);
    if (!midPath) return null;
    for (let i = 1; i < midPath.length; i++) path.push(midPath[i]);
    const lastIdx2 = path[path.length - 1];
    const ingressPath = pathfinder.findPath(lastIdx2, corridorToIdx, options.maxPathLen ?? 512);
    if (!ingressPath || ingressPath.length < 2) return null;
    for (let i = 1; i < ingressPath.length; i++) path.push(ingressPath[i]);
    const footprintIndices = corridorPathOccupiedCellIndices(path, corridorWidth, layout, { interiorOnly: false });
    for (const idx of footprintIndices) if (cellInsideAnyRoom(rooms, idx, layout)) return null;
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
