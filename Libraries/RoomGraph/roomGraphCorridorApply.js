import { corridorSearchBounds, solveCorridorBundle } from "../Pathfinding/Corridor/index.js";
import { buildCorridorBeltsFromPaths } from "./roomGraphCorridorBelts.js";
import { applyCorridorHoleGroupsToRooms } from "./roomGraphClosedRooms.js";
import { buildCorridorRailWallsFromPaths, DEFAULT_CORRIDOR_EGRESS_CELLS } from "./roomGraphCorridorRails.js";
/** @param {import("../Pathfinding/Corridor/corridorBundle.js").CorridorBundle} bundle @param {import("./roomGraphClosedRooms.js").ClosedRoom} roomA @param {import("./roomGraphClosedRooms.js").ClosedRoom} roomB */
export function applyCorridorBundleToRooms(bundle, roomA, roomB) {
    applyCorridorHoleGroupsToRooms(roomA, roomB, bundle.parentHoleGroups, bundle.childHoleGroups);
}
/**
 * @param {import("../Pathfinding/Corridor/corridorBundle.js").CorridorBundle} bundle
 * @param {import("./roomGraphClosedRooms.js").GraphNode[]} rooms
 * @param {import("./roomGraphClosedRooms.js").ClosedRoom[]} closedRooms
 * @param {number} originCol
 * @param {number} originRow
 */
export function stampCorridorBundleRails(bundle, rooms, closedRooms, originCol, originRow) {
    const stampBounds = corridorSearchBounds(rooms, DEFAULT_CORRIDOR_EGRESS_CELLS + 6);
    return buildCorridorRailWallsFromPaths(bundle.paths, bundle.corridorWidths, rooms, closedRooms, stampBounds, originCol, originRow);
}
/**
 * @param {import("../Pathfinding/Corridor/corridorBundle.js").CorridorBundle} bundle
 * @param {import("./roomGraphClosedRooms.js").GraphNode[]} rooms
 * @param {import("./roomGraphCorridorTypes.js").CorridorType} corridorType
 */
export function stampCorridorBundleBelts(bundle, rooms) {
    return buildCorridorBeltsFromPaths(bundle.paths, bundle.corridorWidths, rooms);
}
/**
 * @param {import("./roomGraphClosedRooms.js").GraphNode} roomA
 * @param {import("./roomGraphClosedRooms.js").GraphNode} roomB
 * @param {import("./roomGraphClosedRooms.js").GraphNode[]} allRooms
 * @param {number[]} corridorWidths
 * @param {() => number} rng
 * @param {{ existingPaths?: import("./roomGraphClosedRooms.js").Cell[][], existingPathWidths?: number[] }} options
 */
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
