/** @typedef {{ kind: 'railWall', heightDelta: number, thicknessLevel: number }} RailWallEdge */
/** @typedef {{ kind: 'conveyor' }} ConveyorEdge */
export const EDGE_KIND = { RailWall: "railWall", Conveyor: "conveyor" };
/** @param {number} heightDelta levels above neighbor fill @param {number} thicknessLevel */
export function createRailWallEdge(heightDelta, thicknessLevel) {
    return { kind: EDGE_KIND.RailWall, heightDelta, thicknessLevel };
}
/** @param {object | null | undefined} edge */
export function edgeBlocksCrossing(edge) {
    return edge?.kind === EDGE_KIND.RailWall;
}
/** @param {RailWallEdge} edge @param {number} neighborFillLevel */
export function railWallCapLevel(edge, neighborFillLevel) {
    return neighborFillLevel + edge.heightDelta;
}
/** @param {RailWallEdge} edge @param {number} cellSize @param {number} neighborFillLevel */
export function railWallHeightPx(edge, cellSize, neighborFillLevel) {
    return railWallCapLevel(edge, neighborFillLevel) * cellSize;
}
/** @param {RailWallEdge} edge */
export function railWallThicknessPx(edge) {
    return Math.max(1, edge.thicknessLevel);
}
/** @param {object | null | undefined} edge */
export function isRailWallEdge(edge) {
    return edge?.kind === EDGE_KIND.RailWall;
}
