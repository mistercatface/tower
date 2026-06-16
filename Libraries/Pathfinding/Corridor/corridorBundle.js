import { corridorPathsToOccupiedKeysWithWidths } from "./corridorFootprint.js";
import { addCorridorPathToOccupied, buildCorridorLanePath, createCorridorLaneRouter, removeCorridorPathFromOccupied } from "./corridorLanePath.js";
import { listRoomWallHoleGroups, socketSideToward, wallHoleGroupsOverlap } from "./corridorWallSlots.js";
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
/** @param {RoomRect} roomFrom @param {RoomRect} roomTo @param {WallHoleGroup[]} groups */
function facingWallHoleGroups(roomFrom, roomTo, groups) {
    const side = socketSideToward(roomFrom, roomTo);
    return groups.filter((group) => group.anchor.side === side);
}
/** @param {RoomRect} node @param {number} corridorWidth @param {WallHoleGroup[]} picked */
function availableAttachments(node, corridorWidth, picked) {
    const groups = listRoomWallHoleGroups(node, corridorWidth);
    /** @type {WallHoleGroup[]} */
    const out = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        let clash = false;
        for (let j = 0; j < picked.length; j++)
            if (wallHoleGroupsOverlap(group, picked[j])) {
                clash = true;
                break;
            }
        if (!clash) out.push(group);
    }
    return out;
}
/** @param {WallHole} a @param {WallHole} b */
function attachmentDistance(a, b) {
    return Math.abs(a.c - b.c) + Math.abs(a.r - b.r);
}
/** @param {WallHoleGroup[]} parentGroups @param {WallHoleGroup[]} childGroups @param {() => number} rng */
function orderedAttachmentPairs(parentGroups, childGroups, rng) {
    /** @type {{ pg: WallHoleGroup, cg: WallHoleGroup, score: number }[]} */
    const pairs = [];
    for (let pi = 0; pi < parentGroups.length; pi++) {
        const pg = parentGroups[pi];
        for (let ci = 0; ci < childGroups.length; ci++) {
            const cg = childGroups[ci];
            pairs.push({ pg, cg, score: attachmentDistance(pg.anchor, cg.anchor) + rng() * 0.25 });
        }
    }
    pairs.sort((a, b) => a.score - b.score);
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
 * @param {{ canIntersect?: boolean, maxPathLen?: number }} [params.options]
 * @returns {CorridorBundle | null}
 */
export function solveCorridorBundle(params) {
    const { roomA, roomB, allRooms, corridorWidths, egressCells, existingPaths = [], existingPathWidths = [], rng, options = {} } = params;
    const canIntersect = options.canIntersect === true;
    const pathfinder = createCorridorLaneRouter(allRooms);
    /** @type {Set<string>} */
    const foreignOccupied = canIntersect ? new Set() : corridorPathsToOccupiedKeysWithWidths(existingPaths, existingPathWidths, FULL_FOOTPRINT);
    /** @type {WallHoleGroup[]} */
    const pickedParent = [];
    /** @type {WallHoleGroup[]} */
    const pickedChild = [];
    /** @type {CorridorCell[][]} */
    const paths = [];
    /** @type {number[]} */
    const pathWidths = [];
    /** @type {Set<string>} */
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
            };
        const corridorWidth = corridorWidths[lane];
        const parentAll = availableAttachments(roomA, corridorWidth, pickedParent);
        const childAll = availableAttachments(roomB, corridorWidth, pickedChild);
        const parentFacing = facingWallHoleGroups(roomA, roomB, parentAll);
        const childFacing = facingWallHoleGroups(roomB, roomA, childAll);
        const parentGroups = parentFacing.length ? parentFacing : parentAll;
        const childGroups = childFacing.length ? childFacing : childAll;
        if (!parentGroups.length || !childGroups.length) return null;
        const pairs = orderedAttachmentPairs(parentGroups, childGroups, rng);
        for (let i = 0; i < pairs.length; i++) {
            const { pg, cg } = pairs[i];
            const path = buildCorridorLanePath(pg.anchor, cg.anchor, allRooms, egressCells, corridorWidth, paths, bundleOccupied, pathfinder, {
                canIntersect,
                maxPathLen: options.maxPathLen,
                laneWidths: pathWidths,
                footprint: FULL_FOOTPRINT,
            });
            if (!path) continue;
            pickedParent.push(pg);
            pickedChild.push(cg);
            paths.push(path);
            pathWidths.push(corridorWidth);
            if (!canIntersect) addCorridorPathToOccupied(path, bundleOccupied, corridorWidth, FULL_FOOTPRINT);
            const result = backtrack(lane + 1);
            if (result) return result;
            if (!canIntersect) removeCorridorPathFromOccupied(path, bundleOccupied, corridorWidth, FULL_FOOTPRINT);
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
