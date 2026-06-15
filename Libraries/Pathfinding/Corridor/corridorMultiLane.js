import { corridorPathsToOccupiedKeys } from "./corridorFootprint.js";
import { buildCorridorLanePath, createCorridorLaneRouter } from "./corridorLanePath.js";
import {
    listFacingWallSlots,
    listWallHoleGroups,
    maxCorridorLanesBetweenNodes,
    shuffleIndexOrder,
    socketSideToward,
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

/**
 * Search hole assignments and A* routes jointly via backtracking.
 *
 * @param {object} params
 * @param {RoomNode} parentNode
 * @param {RoomNode} childNode
 * @param {RoomNode[]} allRooms
 * @param {number} corridorCount
 * @param {number} corridorWidth
 * @param {number} egressCells
 * @param {number} gridCols
 * @param {number} gridRows
 * @param {CorridorCell[][]} existingPaths
 * @param {() => number} rng
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
        gridCols,
        gridRows,
        existingPaths,
        rng,
        options = {},
    } = params;
    const canIntersect = options.canIntersect === true;

    if (corridorCount > maxCorridorLanesBetweenNodes(parentNode, childNode, corridorWidth)) return null;

    const parentSide = socketSideToward(parentNode, childNode);
    const childSide = socketSideToward(childNode, parentNode);
    const parentGroups = listWallHoleGroups(listFacingWallSlots(parentNode, parentSide), corridorWidth);
    const childGroups = listWallHoleGroups(listFacingWallSlots(childNode, childSide), corridorWidth);
    if (parentGroups.length < corridorCount || childGroups.length < corridorCount) return null;

    const parentOrder = shuffleIndexOrder(rng, parentGroups.length);
    const childOrder = shuffleIndexOrder(rng, childGroups.length);

    const pathfinder = createCorridorLaneRouter(gridCols, gridRows, allRooms);
    const baseOccupied = corridorPathsToOccupiedKeys(existingPaths, corridorWidth);

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
                    gridCols,
                    gridRows,
                    egressCells,
                    corridorWidth,
                    paths,
                    baseOccupied,
                    pathfinder,
                    { canIntersect, maxPathLen: options.maxPathLen },
                );
                if (!path) continue;

                pickedParent.push(pg);
                pickedChild.push(cg);
                paths.push(path);
                const result = backtrack(lane + 1);
                if (result) return result;
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
