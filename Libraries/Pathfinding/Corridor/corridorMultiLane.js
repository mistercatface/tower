import { solveCorridorBundle, solveUniformCorridorBundle } from "./corridorBundle.js";
/** @param {Parameters<typeof solveCorridorBundle>[0]} params */
export function tryRouteCorridorLanes(params) {
    return solveCorridorBundle(params);
}
/** @param {object} params */
export function tryRouteCorridorsBetweenRooms(params) {
    const { corridorCount, corridorWidth, existingPaths, options = {}, ...rest } = params;
    return solveUniformCorridorBundle(corridorCount, corridorWidth, { ...rest, existingPaths, options });
}
export { solveCorridorBundle, solveUniformCorridorBundle } from "./corridorBundle.js";
