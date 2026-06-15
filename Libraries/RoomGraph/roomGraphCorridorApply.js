import { corridorSearchBounds, solveCorridorBundle } from "../Pathfinding/Corridor/index.js";
import { applyCorridorHoleGroupsToRooms, buildCorridorRailWallsFromPaths, DEFAULT_CORRIDOR_EGRESS_CELLS } from "../Sandbox/sandboxRoomGraphGen.js";
/** @param {import("../Pathfinding/Corridor/corridorBundle.js").CorridorBundle} bundle @param {import("../Sandbox/sandboxRoomGraphGen.js").ClosedRoom} roomA @param {import("../Sandbox/sandboxRoomGraphGen.js").ClosedRoom} roomB */
export function applyCorridorBundleToRooms(bundle, roomA, roomB) {
    applyCorridorHoleGroupsToRooms(roomA, roomB, bundle.parentHoleGroups, bundle.childHoleGroups);
}
/**
 * @param {import("../Pathfinding/Corridor/corridorBundle.js").CorridorBundle} bundle
 * @param {import("../Sandbox/sandboxRoomGraphGen.js").GraphNode[]} rooms
 * @param {import("../Sandbox/sandboxRoomGraphGen.js").ClosedRoom[]} closedRooms
 * @param {number} originCol
 * @param {number} originRow
 */
export function stampCorridorBundleRails(bundle, rooms, closedRooms, originCol, originRow) {
    const stampBounds = corridorSearchBounds(rooms, DEFAULT_CORRIDOR_EGRESS_CELLS + 6);
    return buildCorridorRailWallsFromPaths(bundle.paths, bundle.corridorWidths, rooms, closedRooms, stampBounds, originCol, originRow);
}
/**
 * @param {import("../Sandbox/sandboxRoomGraphGen.js").GraphNode} roomA
 * @param {import("../Sandbox/sandboxRoomGraphGen.js").GraphNode} roomB
 * @param {import("../Sandbox/sandboxRoomGraphGen.js").GraphNode[]} allRooms
 * @param {number[]} corridorWidths
 * @param {() => number} rng
 * @param {{ canIntersect?: boolean, existingPaths?: import("../Sandbox/sandboxRoomGraphGen.js").Cell[][], existingPathWidths?: number[] }} options
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
        options: { canIntersect: options.canIntersect === true },
    });
}
