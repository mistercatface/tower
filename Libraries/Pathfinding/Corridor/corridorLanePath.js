import { gridSideNeighborCell } from "../../Spatial/grid/GridUtils.js";
import {
    corridorPathHitsOccupied,
    corridorPathIntersectsAny,
    corridorPathsToOccupiedKeys,
} from "./corridorFootprint.js";
import { createCorridorGridPathfinder } from "./corridorGridPathfinder.js";
import { buildRoomInteriorBlockedGrid, corridorPathMidCellsClear } from "./corridorWalkGrid.js";

/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {{ c0: number, c1: number, r0: number, r1: number }} RoomRect */

/** @param {CorridorCell} cell @param {number} side */
function stepAcrossSide(cell, side) {
    const n = gridSideNeighborCell(cell.c, cell.r, side);
    return { c: n.col, r: n.row };
}

/** @param {CorridorCell} from @param {CorridorCell} to */
function appendIngress(path, from, to) {
    let p = from;
    while (p.c !== to.c || p.r !== to.r) {
        if (p.c !== to.c) p = { c: p.c + (to.c > p.c ? 1 : -1), r: p.r };
        else p = { c: p.c, r: p.r + (to.r > p.r ? 1 : -1) };
        path.push(p);
    }
}

/** @param {CorridorCell} corridorFrom @param {number} egressCells @param {number} parentSide @param {{ c: number, r: number }[]} midPath @param {CorridorCell} corridorTo */
function assembleCorridorPath(corridorFrom, egressCells, parentSide, midPath, corridorTo) {
    /** @type {CorridorCell[]} */
    const path = [corridorFrom];
    let p = corridorFrom;
    for (let i = 0; i < egressCells; i++) {
        p = stepAcrossSide(p, parentSide);
        path.push(p);
    }
    for (let i = 1; i < midPath.length; i++) path.push(midPath[i]);
    appendIngress(path, path[path.length - 1], corridorTo);
    return path;
}

/**
 * Route one corridor lane: fixed egress/ingress strips + A* mid section.
 *
 * @param {WallHole} parentHole
 * @param {WallHole} childHole
 * @param {RoomRect[]} rooms
 * @param {number} cols
 * @param {number} rows
 * @param {number} egressCells
 * @param {number} corridorWidth
 * @param {CorridorCell[][]} lanePaths
 * @param {Set<string>} baseOccupied
 * @param {import("./corridorGridPathfinder.js").CorridorGridPathfinder} pathfinder
 * @param {{ canIntersect?: boolean, maxPathLen?: number }} [options]
 * @returns {CorridorCell[] | null}
 */
export function buildCorridorLanePath(parentHole, childHole, rooms, cols, rows, egressCells, corridorWidth, lanePaths, baseOccupied, pathfinder, options = {}) {
    const canIntersect = options.canIntersect === true;
    const corridorFrom = stepAcrossSide(parentHole, parentHole.side);
    const corridorTo = stepAcrossSide(childHole, childHole.side);
    const approachEnd = stepAcrossSide(corridorTo, childHole.side);
    let egressEnd = corridorFrom;
    for (let i = 0; i < egressCells; i++) egressEnd = stepAcrossSide(egressEnd, parentHole.side);

    /** @type {Set<string>} */
    const reserved = new Set(baseOccupied);
    if (!canIntersect) {
        const laneKeys = corridorPathsToOccupiedKeys(lanePaths, corridorWidth);
        for (const key of laneKeys) reserved.add(key);
    }
    pathfinder.setReservedKeys(reserved);

    const midPath = pathfinder.findPath(egressEnd.c, egressEnd.r, approachEnd.c, approachEnd.r, options.maxPathLen ?? 512);
    if (!midPath) return null;

    const path = assembleCorridorPath(corridorFrom, egressCells, parentHole.side, midPath, corridorTo);
    if (!corridorPathMidCellsClear(rooms, path)) return null;
    if (!canIntersect && lanePaths.length && corridorPathIntersectsAny(path, lanePaths, corridorWidth)) return null;
    if (corridorPathHitsOccupied(path, baseOccupied, corridorWidth)) return null;
    return path;
}

/** @param {number} cols @param {number} rows @param {RoomRect[]} rooms */
export function createCorridorLaneRouter(cols, rows, rooms) {
    const pathfinder = createCorridorGridPathfinder(cols, rows);
    pathfinder.setRoomBlocked(buildRoomInteriorBlockedGrid(cols, rows, rooms));
    return pathfinder;
}
