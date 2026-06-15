import { corridorPathsToOccupiedKeysWithWidths } from "./corridorFootprint.js";
import {
    addCorridorPathToOccupied,
    buildCorridorLanePath,
    createCorridorLaneRouter,
} from "./corridorLanePath.js";
import {
    listRoomWallHoleGroups,
    shuffleIndexOrder,
    wallHoleGroupsOverlap,
} from "./corridorWallSlots.js";

/** @typedef {{ c: number, r: number, side: number }} WallHole */
/** @typedef {{ c: number, r: number }} CorridorCell */
/** @typedef {{ c0: number, c1: number, r0: number, r1: number, centerC: number, centerR: number }} RoomNode */
/** @typedef {{ anchor: WallHole, slots: WallHole[] }} WallHoleGroup */

/**
 * @typedef {object} CorridorRouteResult
 * @property {WallHole[]} parentAnchors
 * @property {WallHole[]} childAnchors
 * @property {WallHole[][]} parentHoleGroups
 * @property {WallHole[][]} childHoleGroups
 * @property {CorridorCell[][]} paths
 * @property {number[]} corridorWidths
 */

/** @param {RoomNode} node @param {number} corridorWidth @param {WallHoleGroup[]} picked */
function availableWallHoleGroups(node, corridorWidth, picked) {
    const groups = listRoomWallHoleGroups(node, corridorWidth);
    /** @type {WallHoleGroup[]} */
    const out = [];
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        let clash = false;
        for (let j = 0; j < picked.length; j++) {
            if (wallHoleGroupsOverlap(group, picked[j])) {
                clash = true;
                break;
            }
        }
        if (!clash) out.push(group);
    }
    return out;
}

/**
 * @param {object} params
 * @param {RoomNode} params.parentNode
 * @param {RoomNode} params.childNode
 * @param {RoomNode[]} params.allRooms
 * @param {number} params.corridorWidth
 * @param {WallHoleGroup[]} params.pickedParent
 * @param {WallHoleGroup[]} params.pickedChild
 * @param {CorridorCell[][]} params.paths
 * @param {number[]} params.pathWidths
 * @param {number} params.egressCells
 * @param {Set<string>} params.laneOccupied
 * @param {boolean} params.canIntersect
 * @param {import("./corridorGridPathfinder.js").CorridorGridPathfinder} params.pathfinder
 * @param {() => number} params.rng
 * @param {{ maxPathLen?: number }} params.options
 * @returns {{ parentGroup: WallHoleGroup, childGroup: WallHoleGroup, path: CorridorCell[] } | null}
 */
function tryRouteOneCorridorLane(params) {
    const {
        parentNode,
        childNode,
        allRooms,
        corridorWidth,
        pickedParent,
        pickedChild,
        paths,
        pathWidths,
        egressCells,
        laneOccupied,
        canIntersect,
        pathfinder,
        rng,
        options,
    } = params;
    const parentGroups = availableWallHoleGroups(parentNode, corridorWidth, pickedParent);
    const childGroups = availableWallHoleGroups(childNode, corridorWidth, pickedChild);
    if (!parentGroups.length || !childGroups.length) return null;
    const parentOrder = shuffleIndexOrder(rng, parentGroups.length);
    const childOrder = shuffleIndexOrder(rng, childGroups.length);
    for (let poi = 0; poi < parentOrder.length; poi++) {
        const pg = parentGroups[parentOrder[poi]];
        for (let coi = 0; coi < childOrder.length; coi++) {
            const cg = childGroups[childOrder[coi]];
            const path = buildCorridorLanePath(
                pg.anchor,
                cg.anchor,
                allRooms,
                egressCells,
                corridorWidth,
                paths,
                laneOccupied,
                pathfinder,
                { canIntersect, maxPathLen: options.maxPathLen, laneWidths: pathWidths },
            );
            if (!path) continue;
            return { parentGroup: pg, childGroup: cg, path };
        }
    }
    return null;
}

/**
 * @param {object} params
 * @param {RoomNode} params.parentNode
 * @param {RoomNode} params.childNode
 * @param {RoomNode[]} params.allRooms
 * @param {number[]} params.corridorWidths
 * @param {number} params.egressCells
 * @param {CorridorCell[][]} [params.existingPaths]
 * @param {number[]} [params.existingPathWidths]
 * @param {() => number} params.rng
 * @param {{ canIntersect?: boolean, maxPathLen?: number }} [params.options]
 * @returns {CorridorRouteResult | null}
 */
export function tryRouteCorridorLanes(params) {
    const {
        parentNode,
        childNode,
        allRooms,
        corridorWidths,
        egressCells,
        existingPaths = [],
        existingPathWidths = [],
        rng,
        options = {},
    } = params;
    const canIntersect = options.canIntersect === true;
    const pathfinder = createCorridorLaneRouter(allRooms);
    /** @type {Set<string>} */
    const laneOccupied = canIntersect ? new Set() : corridorPathsToOccupiedKeysWithWidths(existingPaths, existingPathWidths);
    /** @type {WallHoleGroup[]} */
    const pickedParent = [];
    /** @type {WallHoleGroup[]} */
    const pickedChild = [];
    /** @type {CorridorCell[][]} */
    const paths = [];
    /** @type {number[]} */
    const pathWidths = [];
    for (let lane = 0; lane < corridorWidths.length; lane++) {
        const corridorWidth = corridorWidths[lane];
        const result = tryRouteOneCorridorLane({
            parentNode,
            childNode,
            allRooms,
            corridorWidth,
            pickedParent,
            pickedChild,
            paths,
            pathWidths,
            egressCells,
            laneOccupied,
            canIntersect,
            pathfinder,
            rng,
            options,
        });
        if (!result) return null;
        pickedParent.push(result.parentGroup);
        pickedChild.push(result.childGroup);
        paths.push(result.path);
        pathWidths.push(corridorWidth);
        if (!canIntersect) addCorridorPathToOccupied(result.path, laneOccupied, corridorWidth);
    }
    return {
        parentAnchors: pickedParent.map((g) => g.anchor),
        childAnchors: pickedChild.map((g) => g.anchor),
        parentHoleGroups: pickedParent.map((g) => g.slots),
        childHoleGroups: pickedChild.map((g) => g.slots),
        paths,
        corridorWidths: pathWidths,
    };
}

/**
 * @param {object} params
 * @param {RoomNode} params.parentNode
 * @param {RoomNode} params.childNode
 * @param {RoomNode[]} params.allRooms
 * @param {number} params.corridorCount
 * @param {number} params.corridorWidth
 * @param {number} params.egressCells
 * @param {CorridorCell[][]} params.existingPaths
 * @param {() => number} params.rng
 * @param {{ canIntersect?: boolean, maxPathLen?: number }} [params.options]
 * @returns {CorridorRouteResult | null}
 */
export function tryRouteCorridorsBetweenRooms(params) {
    const { corridorCount, corridorWidth, existingPaths, options = {}, ...rest } = params;
    const corridorWidths = new Array(corridorCount).fill(corridorWidth);
    const existingPathWidths = existingPaths.map(() => corridorWidth);
    return tryRouteCorridorLanes({ ...rest, corridorWidths, existingPaths, existingPathWidths, options });
}
