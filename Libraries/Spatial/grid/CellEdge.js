/** @typedef {{ kind: 'railWall', heightDelta: number, thicknessLevel: number }} RailWallEdge */
/** @typedef {{ kind: 'conveyor' }} ConveyorEdge */
/** @typedef {{ kind: 'beltRail' }} BeltRailEdge */
/** @typedef {{ kind: 'forcefield' }} ForcefieldEdge */
export const EDGE_KIND = { RailWall: "railWall", Conveyor: "conveyor", BeltRail: "beltRail", Forcefield: "forcefield" };
/** @param {number} heightDelta levels above neighbor fill @param {number} thicknessLevel */
export function createRailWallEdge(heightDelta, thicknessLevel) {
    return { kind: EDGE_KIND.RailWall, heightDelta, thicknessLevel };
}
export function createBeltRailEdge() {
    return { kind: EDGE_KIND.BeltRail };
}
export function createForcefieldEdge() {
    return { kind: EDGE_KIND.Forcefield };
}
/** @param {object | null | undefined} edge */
export function isRailWallEdge(edge) {
    return edge?.kind === EDGE_KIND.RailWall;
}
/** @param {object | null | undefined} edge */
export function isBeltRailEdge(edge) {
    return edge?.kind === EDGE_KIND.BeltRail;
}
/** @param {object | null | undefined} edge */
export function isForcefieldEdge(edge) {
    return edge?.kind === EDGE_KIND.Forcefield;
}
/** Static edge kinds that always block crossing (not forcefields — those depend on powered state). */
export function edgeBlocksCrossing(edge) {
    return isRailWallEdge(edge) || isBeltRailEdge(edge);
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
