/** @typedef {{ kind: 'railWall', heightDelta: number, thicknessLevel: number }} RailWallEdge */
/** @typedef {{ kind: 'conveyor' }} ConveyorEdge */
/** @typedef {{ kind: 'beltRail' }} BeltRailEdge */
/** @typedef {{ kind: 'forcefield', mode: string, allowedSide: number, powered: boolean, accessMode?: string, accessBlock?: string, partnerKey?: number, linkMode?: string, linkSourceKey?: number }} ForcefieldEdge */
export const EDGE_KIND = { RailWall: "railWall", Conveyor: "conveyor", BeltRail: "beltRail", Forcefield: "forcefield" };
export const PASSAGE_MODE = { Solid: "solid", OneWay: "oneWay", Tripwire: "tripwire", Portal: "portal" };
export const PORTAL_ACCESS_MODE = { Both: "both", One: "one" };
/** Which systems enforce access-one blocking — default both step grid and physics. */
export const PORTAL_ACCESS_BLOCK = { All: "all", Step: "step", Physics: "physics" };
/** @param {unknown} raw */
export function parsePassageMode(raw) {
    if (raw === PASSAGE_MODE.OneWay || raw === PASSAGE_MODE.Tripwire) return raw;
    return PASSAGE_MODE.Solid;
}
/** @param {unknown} raw */
export function parsePortalAccessMode(raw) {
    if (raw === PORTAL_ACCESS_MODE.One) return PORTAL_ACCESS_MODE.One;
    return PORTAL_ACCESS_MODE.Both;
}
/** @param {string} mode */
export function formatPassageModeLabel(mode) {
    if (mode === PASSAGE_MODE.OneWay) return "One-way";
    if (mode === PASSAGE_MODE.Tripwire) return "Tripwire";
    if (mode === PASSAGE_MODE.Portal) return "Portal";
    return "Solid";
}
/** @param {number} heightDelta levels above neighbor fill @param {number} thicknessLevel */
export function createRailWallEdge(heightDelta, thicknessLevel) {
    return { kind: EDGE_KIND.RailWall, heightDelta, thicknessLevel };
}
export function createBeltRailEdge() {
    return { kind: EDGE_KIND.BeltRail };
}
/** @param {{ mode?: string, allowedSide?: number, powered?: boolean }} [opts] */
export function createForcefieldEdge({ mode = PASSAGE_MODE.Solid, allowedSide = 1, powered = false } = {}) {
    return { kind: EDGE_KIND.Forcefield, mode: parsePassageMode(mode), allowedSide, powered: powered === true };
}
/** @param {unknown} raw */
export function parsePortalAccessBlock(raw) {
    if (raw === PORTAL_ACCESS_BLOCK.Step) return PORTAL_ACCESS_BLOCK.Step;
    if (raw === PORTAL_ACCESS_BLOCK.Physics) return PORTAL_ACCESS_BLOCK.Physics;
    return PORTAL_ACCESS_BLOCK.All;
}
/** @param {{ accessMode?: string, allowedSide?: number, accessBlock?: string, partnerKey?: number, linkMode?: string, linkSourceKey?: number, powered?: boolean }} [opts] */
export function createPortalEdge({
    accessMode = PORTAL_ACCESS_MODE.Both,
    allowedSide = 1,
    accessBlock = PORTAL_ACCESS_BLOCK.All,
    partnerKey = 0,
    linkMode = "shared",
    linkSourceKey = 0,
    powered = false,
} = {}) {
    return {
        kind: EDGE_KIND.Forcefield,
        mode: PASSAGE_MODE.Portal,
        accessMode: parsePortalAccessMode(accessMode),
        allowedSide,
        accessBlock: parsePortalAccessBlock(accessBlock),
        partnerKey,
        linkMode,
        linkSourceKey,
        powered: powered === true,
    };
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
/** @param {object | null | undefined} edge */
export function isPortalEdge(edge) {
    return isForcefieldEdge(edge) && edge.mode === PASSAGE_MODE.Portal;
}
/** Powered laser/tripwire passage — not a portal pair. */
export function isPassageLaserEdge(edge) {
    return isForcefieldEdge(edge) && edge.mode !== PASSAGE_MODE.Portal;
}
/** Laser or portal — both conduct passage power along the shared vertex graph. */
export function isPassagePowerConductorEdge(edge) {
    return isPassageLaserEdge(edge) || isPortalEdge(edge);
}
/** Static edge kinds that always block crossing (not forcefields — those depend on passage profile + powered). */
export function edgeBlocksCrossing(edge) {
    return isRailWallEdge(edge) || isBeltRailEdge(edge);
}
/** @param {object | null | undefined} edge @param {number} ownerSide side the passage was stamped on */
export function resolvePassageEdge(edge, ownerSide) {
    const mode = parsePassageMode(edge?.mode);
    const allowedSide = edge?.allowedSide ?? ownerSide;
    return { mode, allowedSide, powered: edge?.powered === true };
}
/** @param {object | null | undefined} edge @param {number} crossedSide side being crossed on the owner cell @param {number} ownerSide side the passage was stamped on */
export function passageEdgeBlocksStep(edge, crossedSide, ownerSide) {
    if (isPortalEdge(edge)) return false;
    if (!isForcefieldEdge(edge) || edge.powered !== true) return false;
    const { mode, allowedSide } = resolvePassageEdge(edge, ownerSide);
    if (mode === PASSAGE_MODE.Tripwire) return false;
    if (mode === PASSAGE_MODE.Solid) return true;
    return crossedSide !== allowedSide;
}
/** Powered solid/oneWay emit edge-rail collision; tripwire never does. */
export function passageEdgeEmitsCollision(edge) {
    if (isPortalEdge(edge)) return false;
    if (!isForcefieldEdge(edge) || edge.powered !== true) return false;
    return parsePassageMode(edge.mode) !== PASSAGE_MODE.Tripwire;
}
/** One-way passage: skip collision when moving clearly in the allowed crossing direction. */
export function passageEdgeBlocksCollision(edge, gridSide, vx, vy) {
    if (!passageEdgeEmitsCollision(edge)) return false;
    const mode = parsePassageMode(edge.mode);
    if (mode !== PASSAGE_MODE.OneWay) return true;
    const { allowedSide } = resolvePassageEdge(edge, gridSide);
    let outwardX;
    let outwardY;
    if (allowedSide === 0) {
        outwardX = 0;
        outwardY = -1;
    } else if (allowedSide === 1) {
        outwardX = 1;
        outwardY = 0;
    } else if (allowedSide === 2) {
        outwardX = 0;
        outwardY = 1;
    } else {
        outwardX = -1;
        outwardY = 0;
    }
    return vx * outwardX + vy * outwardY <= 0.5;
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
