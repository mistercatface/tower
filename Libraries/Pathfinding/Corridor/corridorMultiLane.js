import { corridorPathsToOccupiedKeys } from "./corridorFootprint.js";
import {
    addCorridorPathToOccupied,
    buildCorridorLanePath,
    createCorridorLaneRouter,
    removeCorridorPathFromOccupied,
} from "./corridorLanePath.js";
import {
    listFacingWallSlots,
    listWallHoleGroups,
    maxCorridorLanesBetweenNodes,
    pickSpreadNonOverlappingGroups,
    shuffleIndexOrder,
    socketSideToward,
    sortWallHoleGroupsAlongWall,
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
 */

/** @param {WallHoleGroup[]} pickedParent @param {WallHoleGroup[]} pickedChild @param {object} ctx @returns {CorridorRouteResult | null} */
function routePickedHoleGroups(pickedParent, pickedChild, ctx) {
    const { allRooms, corridorCount, corridorWidth, egressCells, existingPaths, canIntersect, pathfinder, options } = ctx;
    const baseOccupied = corridorPathsToOccupiedKeys(existingPaths, corridorWidth);
    /** @type {CorridorCell[][]} */
    const paths = [];
    /** @type {CorridorCell[][]} */
    const lanePaths = [];
    for (let lane = 0; lane < corridorCount; lane++) {
        const path = buildCorridorLanePath(
            pickedParent[lane].anchor,
            pickedChild[lane].anchor,
            allRooms,
            egressCells,
            corridorWidth,
            lanePaths,
            baseOccupied,
            pathfinder,
            { canIntersect, maxPathLen: options.maxPathLen },
        );
        if (!path) return null;
        paths.push(path);
        lanePaths.push(path);
    }
    return {
        parentAnchors: pickedParent.map((g) => g.anchor),
        childAnchors: pickedChild.map((g) => g.anchor),
        parentHoleGroups: pickedParent.map((g) => g.slots),
        childHoleGroups: pickedChild.map((g) => g.slots),
        paths,
    };
}

/** @param {object} params @returns {CorridorRouteResult | null} */
function tryGreedyCorridorRoute(params) {
    const { parentNode, childNode, allRooms, corridorCount, corridorWidth, egressCells, existingPaths, options = {} } = params;
    const canIntersect = options.canIntersect === true;
    const parentSide = socketSideToward(parentNode, childNode);
    const childSide = socketSideToward(childNode, parentNode);
    const parentGroups = sortWallHoleGroupsAlongWall(listWallHoleGroups(listFacingWallSlots(parentNode, parentSide), corridorWidth), parentSide);
    const childGroups = sortWallHoleGroupsAlongWall(listWallHoleGroups(listFacingWallSlots(childNode, childSide), corridorWidth), childSide);
    const pickedParent = pickSpreadNonOverlappingGroups(parentGroups, corridorCount);
    const pickedChild = pickSpreadNonOverlappingGroups(childGroups, corridorCount);
    if (!pickedParent || !pickedChild) return null;
    const pathfinder = createCorridorLaneRouter(allRooms);
    return routePickedHoleGroups(pickedParent, pickedChild, {
        allRooms,
        corridorCount,
        corridorWidth,
        egressCells,
        existingPaths,
        canIntersect,
        pathfinder,
        options,
    });
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
    const {
        parentNode,
        childNode,
        allRooms,
        corridorCount,
        corridorWidth,
        egressCells,
        existingPaths,
        rng,
        options = {},
    } = params;
    const canIntersect = options.canIntersect === true;

    if (corridorCount > maxCorridorLanesBetweenNodes(parentNode, childNode, corridorWidth)) return null;

    const greedy = tryGreedyCorridorRoute(params);
    if (greedy) return greedy;

    const parentSide = socketSideToward(parentNode, childNode);
    const childSide = socketSideToward(childNode, parentNode);
    const parentGroups = listWallHoleGroups(listFacingWallSlots(parentNode, parentSide), corridorWidth);
    const childGroups = listWallHoleGroups(listFacingWallSlots(childNode, childSide), corridorWidth);
    if (parentGroups.length < corridorCount || childGroups.length < corridorCount) return null;

    const parentOrder = shuffleIndexOrder(rng, parentGroups.length);
    const childOrder = shuffleIndexOrder(rng, childGroups.length);

    const pathfinder = createCorridorLaneRouter(allRooms);
    const baseOccupied = corridorPathsToOccupiedKeys(existingPaths, corridorWidth);
    /** @type {Set<string>} */
    const laneOccupied = new Set(baseOccupied);

    /** @type {WallHoleGroup[]} */
    const pickedParent = [];
    /** @type {WallHoleGroup[]} */
    const pickedChild = [];
    /** @type {CorridorCell[][]} */
    const paths = [];

    /** @param {number} lane @returns {CorridorRouteResult | null} */
    function backtrack(lane) {
        if (lane === corridorCount) {
            return {
                parentAnchors: pickedParent.map((g) => g.anchor),
                childAnchors: pickedChild.map((g) => g.anchor),
                parentHoleGroups: pickedParent.map((g) => g.slots),
                childHoleGroups: pickedChild.map((g) => g.slots),
                paths: paths.slice(),
            };
        }

        for (let poi = 0; poi < parentOrder.length; poi++) {
            const pg = parentGroups[parentOrder[poi]];
            let parentClash = false;
            for (let i = 0; i < pickedParent.length; i++) if (wallHoleGroupsOverlap(pg, pickedParent[i])) {
                parentClash = true;
                break;
            }
            if (parentClash) continue;

            for (let coi = 0; coi < childOrder.length; coi++) {
                const cg = childGroups[childOrder[coi]];
                let childClash = false;
                for (let i = 0; i < pickedChild.length; i++) if (wallHoleGroupsOverlap(cg, pickedChild[i])) {
                    childClash = true;
                    break;
                }
                if (childClash) continue;

                const path = buildCorridorLanePath(
                    pg.anchor,
                    cg.anchor,
                    allRooms,
                    egressCells,
                    corridorWidth,
                    paths,
                    laneOccupied,
                    pathfinder,
                    { canIntersect, maxPathLen: options.maxPathLen },
                );
                if (!path) continue;

                pickedParent.push(pg);
                pickedChild.push(cg);
                paths.push(path);
                if (!canIntersect) addCorridorPathToOccupied(path, laneOccupied, corridorWidth);
                const result = backtrack(lane + 1);
                if (result) return result;
                if (!canIntersect) removeCorridorPathFromOccupied(path, laneOccupied, corridorWidth);
                paths.pop();
                pickedChild.pop();
                pickedParent.pop();
            }
        }
        return null;
    }

    return backtrack(0);
}

export { maxCorridorLanesBetweenNodes } from "./corridorWallSlots.js";
