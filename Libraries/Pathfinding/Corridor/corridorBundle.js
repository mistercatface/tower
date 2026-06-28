import { corridorPathsToOccupiedCellIndices } from "./corridorFootprint.js";
import { addCorridorPathToOccupied, buildCorridorLanePath, createCorridorLaneRouter, removeCorridorPathFromOccupied } from "./corridorLanePath.js";
import { listRoomWallHoleGroups, wallHoleGroupsOverlap } from "./corridorWallSlots.js";
/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {{ c0: number, c1: number, r0: number, r1: number, centerC?: number, centerR?: number }} RoomRect */
/** @typedef {{ anchor: WallHole, slots: WallHole[] }} WallHoleGroup */
/** @type {{ interiorOnly: false }} */
const FULL_FOOTPRINT = { interiorOnly: false };
/**
 * @typedef {object} CorridorBundle
 * @property {WallHole[]} parentAnchors
 * @property {WallHole[]} childAnchors
 * @property {WallHole[][]} parentHoleGroups
 * @property {WallHole[][]} childHoleGroups
 * @property {CorridorCell[][]} paths
 * @property {number[]} corridorWidths
 */
/** @param {RoomRect} node @param {number} corridorWidth @param {WallHoleGroup[]} picked */
function availableAttachments(node, corridorWidth, picked) {
    const groups = listRoomWallHoleGroups(node, corridorWidth);
    /** @type {WallHoleGroup[]} */
    const out = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        let overlap = false;
        for (let j = 0; j < picked.length; j++)
            if (wallHoleGroupsOverlap(group, picked[j])) {
                overlap = true;
                break;
            }
        if (!overlap) out.push(group);
    }
    return out;
}
/**
 * @param {WallHoleGroup[]} parentGroups
 * @param {WallHoleGroup[]} childGroups
 * @param {() => number} rng
 */
function orderedAttachmentPairs(parentGroups, childGroups, rng) {
    /** @type {{ pg: WallHoleGroup, cg: WallHoleGroup, dist: number }[]} */
    const pairs = [];
    for (let i = 0; i < parentGroups.length; i++) {
        const pg = parentGroups[i];
        for (let j = 0; j < childGroups.length; j++) {
            const cg = childGroups[j];
            const dc = pg.anchor.c - cg.anchor.c;
            const dr = pg.anchor.r - cg.anchor.r;
            pairs.push({ pg, cg, dist: dc * dc + dr * dr });
        }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    return pairs;
}
/**
 * Geometry-only corridor bundle solver: N tubes between two room rects.
 * Attachment sides are chosen here, not by the graph link.
 *
 * @param {object} params
 * @param {RoomRect} params.roomA
 * @param {RoomRect} params.roomB
 * @param {RoomRect[]} params.allRooms
 * @param {number[]} params.corridorWidths
 * @param {number} params.egressCells
 * @param {CorridorCell[][]} [params.existingPaths]
 * @param {number[]} [params.existingPathWidths]
 * @param {() => number} params.rng
 * @param {{ maxPathLen?: number }} [params.options]
 * @returns {CorridorBundle | null}
 */
export function solveCorridorBundle(params) {
    const { roomA, roomB, allRooms, corridorWidths, egressCells, existingPaths = [], existingPathWidths = [], rng, options = {} } = params;
    const { pathfinder, layout, roomBlocked } = createCorridorLaneRouter(allRooms, 12);
    const foreignOccupied = corridorPathsToOccupiedCellIndices(existingPaths, existingPathWidths, layout, FULL_FOOTPRINT);
    /** @type {WallHoleGroup[]} */
    const pickedParent = [];
    /** @type {WallHoleGroup[]} */
    const pickedChild = [];
    /** @type {number[][]} */
    const paths = [];
    /** @type {number[]} */
    const pathWidths = [];
    /** @type {Set<number>} */
    const bundleOccupied = new Set(foreignOccupied);
    /** @param {number} lane @returns {CorridorBundle | null} */
    function backtrack(lane) {
        if (lane === corridorWidths.length)
            return {
                parentAnchors: pickedParent.map((g) => g.anchor),
                childAnchors: pickedChild.map((g) => g.anchor),
                parentHoleGroups: pickedParent.map((g) => g.slots),
                childHoleGroups: pickedChild.map((g) => g.slots),
                paths: paths.slice(),
                corridorWidths: corridorWidths.slice(),
                layout,
            };
        const corridorWidth = corridorWidths[lane];
        const parentGroups = availableAttachments(roomA, corridorWidth, pickedParent);
        const childGroups = availableAttachments(roomB, corridorWidth, pickedChild);
        if (!parentGroups.length || !childGroups.length) return null;
        const pairs = orderedAttachmentPairs(parentGroups, childGroups, rng);
        for (let i = 0; i < pairs.length; i++) {
            const { pg, cg } = pairs[i];
            const path = buildCorridorLanePath(pg.anchor, cg.anchor, allRooms, egressCells, corridorWidth, paths, bundleOccupied, pathfinder, layout, {
                maxPathLen: options.maxPathLen,
                laneWidths: pathWidths,
                footprint: FULL_FOOTPRINT,
                roomBlocked,
            });
            if (!path) continue;
            pickedParent.push(pg);
            pickedChild.push(cg);
            paths.push(path);
            pathWidths.push(corridorWidth);
            addCorridorPathToOccupied(path, bundleOccupied, corridorWidth, layout, FULL_FOOTPRINT);
            const result = backtrack(lane + 1);
            if (result) return result;
            removeCorridorPathFromOccupied(path, bundleOccupied, corridorWidth, layout, FULL_FOOTPRINT);
            pathWidths.pop();
            paths.pop();
            pickedChild.pop();
            pickedParent.pop();
        }
        return null;
    }
    return backtrack(0);
}
/** @param {number} corridorCount @param {number} corridorWidth @param {object} params */
export function solveUniformCorridorBundle(corridorCount, corridorWidth, params) {
    const corridorWidths = new Array(corridorCount).fill(corridorWidth);
    const existingPaths = params.existingPaths ?? [];
    return solveCorridorBundle({ ...params, corridorWidths, existingPathWidths: existingPaths.map(() => corridorWidth) });
}
