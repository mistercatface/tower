import { gridSideNeighborCell } from "../../Spatial/grid/GridUtils.js";
import {
    corridorPathHitsOccupied,
    corridorPathIntersectsPaths,
    corridorPathOccupiedCellKeys,
    corridorPathsToOccupiedKeysWithWidths,
} from "./corridorFootprint.js";
import { createCorridorGridPathfinder } from "./corridorGridPathfinder.js";
import { buildRoomInteriorBlockedGridLocal, corridorPathFootprintInsideAnyRoom, corridorSearchBounds } from "./corridorWalkGrid.js";

/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */

/** @param {RoomRect[]} rooms @param {number} [pad] */
export function createCorridorLaneRouter(rooms, pad = 12) {
    const bounds = corridorSearchBounds(rooms, pad);
    const pathfinder = createCorridorGridPathfinder(bounds);
    pathfinder.setRoomBlocked(buildRoomInteriorBlockedGridLocal(bounds.originCol, bounds.originRow, bounds.cols, bounds.rows, rooms));
    return pathfinder;
}

/** @param {CorridorCell} cell @param {number} side */
function stepAcrossSide(cell, side) {
    const n = gridSideNeighborCell(cell.c, cell.r, side);
    return { c: n.col, r: n.row };
}

/** @param {CorridorCell} corridorFrom @param {number} egressCells @param {number} parentSide @param {{ c: number, r: number }[]} midPath */
function assembleCorridorPath(corridorFrom, egressCells, parentSide, midPath) {
    /** @type {CorridorCell[]} */
    const path = [corridorFrom];
    let p = corridorFrom;
    for (let i = 0; i < egressCells; i++) {
        p = stepAcrossSide(p, parentSide);
        path.push(p);
    }
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
 * @param {Set<string>} baseOccupied
 * @param {import("./corridorGridPathfinder.js").CorridorGridPathfinder} pathfinder
 * @param {{ canIntersect?: boolean, maxPathLen?: number }} [options]
 * @returns {CorridorCell[] | null}
 */
export function buildCorridorLanePath(parentHole, childHole, rooms, egressCells, corridorWidth, lanePaths, baseOccupied, pathfinder, options = {}) {
    const canIntersect = options.canIntersect === true;
    const corridorFrom = stepAcrossSide(parentHole, parentHole.side);
    const corridorTo = stepAcrossSide(childHole, childHole.side);
    const approachEnd = stepAcrossSide(corridorTo, childHole.side);
    let egressEnd = corridorFrom;
    for (let i = 0; i < egressCells; i++) egressEnd = stepAcrossSide(egressEnd, parentHole.side);

    /** @type {Set<string>} */
    const reserved = new Set(baseOccupied);
    if (!canIntersect) {
        const laneWidths = options.laneWidths ?? lanePaths.map(() => corridorWidth);
        const laneKeys = corridorPathsToOccupiedKeysWithWidths(lanePaths, laneWidths);
        for (const key of laneKeys) reserved.add(key);
    }
    pathfinder.setReservedKeys(reserved);

    const midPath = pathfinder.findPath(egressEnd.c, egressEnd.r, approachEnd.c, approachEnd.r, options.maxPathLen ?? 512);
    if (!midPath) return null;

    /** @type {CorridorCell[]} */
    let path = assembleCorridorPath(corridorFrom, egressCells, parentHole.side, midPath);
    const ingressPath = pathfinder.findPath(path[path.length - 1].c, path[path.length - 1].r, corridorTo.c, corridorTo.r, options.maxPathLen ?? 512);
    if (!ingressPath || ingressPath.length < 2) return null;
    for (let i = 1; i < ingressPath.length; i++) path.push(ingressPath[i]);

    if (corridorPathFootprintInsideAnyRoom(rooms, path, corridorWidth)) return null;
    if (!canIntersect && lanePaths.length) {
        const laneWidths = options.laneWidths ?? lanePaths.map(() => corridorWidth);
        if (corridorPathIntersectsPaths(path, corridorWidth, lanePaths, laneWidths)) return null;
    }
    if (corridorPathHitsOccupied(path, baseOccupied, corridorWidth)) return null;
    return path;
}

/** @param {CorridorCell[]} path @param {Set<string>} occupied @param {number} corridorWidth */
export function addCorridorPathToOccupied(path, occupied, corridorWidth) {
    const keys = corridorPathOccupiedCellKeys(path, corridorWidth);
    for (const key of keys) occupied.add(key);
}

/** @param {CorridorCell[]} path @param {Set<string>} occupied @param {number} corridorWidth */
export function removeCorridorPathFromOccupied(path, occupied, corridorWidth) {
    const keys = corridorPathOccupiedCellKeys(path, corridorWidth);
    for (const key of keys) occupied.delete(key);
}
