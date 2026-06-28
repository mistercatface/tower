import { corridorSearchBounds, solveCorridorBundle } from "../Pathfinding/Corridor/index.js";
import { corridorSearchLayout } from "../Pathfinding/Corridor/corridorWalkGrid.js";
import { buildCorridorBeltsFromPaths } from "./roomGraphCorridorBelts.js";
import { applyCorridorHoleGroupsToRooms } from "./roomGraphClosedRooms.js";
import { buildCorridorRailWallsFromPaths, DEFAULT_CORRIDOR_EGRESS_CELLS } from "./roomGraphCorridorRails.js";
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
