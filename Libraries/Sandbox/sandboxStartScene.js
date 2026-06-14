import { gridSettings } from "../../Config/balance/grid.js";
import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { PORTAL_ACCESS_MODE } from "../Spatial/grid/CellEdge.js";
import { portalAccessDefaultAllowedSide } from "../Spatial/grid/portalAccess.js";
import { gridWallEdgeMirrorSide } from "../World/wallGridCells.js";
import { applySandboxSceneSnapshot, SANDBOX_SCENE_SCHEMA_VERSION } from "./sandboxSceneSnapshot.js";
/** Canonical packed edge key in global cell coordinates (grid origin at 0,0). */
function globalCanonicalEdgeKey(globalCol, globalRow, side) {
    const keyA = packEdgeCellKey(globalCol, globalRow, side);
    let nc = globalCol;
    let nr = globalRow;
    if (side === 0) nr = globalRow - 1;
    else if (side === 1) nc = globalCol + 1;
    else if (side === 2) nr = globalRow + 1;
    else nc = globalCol - 1;
    const keyB = packEdgeCellKey(nc, nr, gridWallEdgeMirrorSide(side));
    return keyA <= keyB ? keyA : keyB;
}
/** @param {number} globalCol @param {number} globalRow @param {number} side */
function solidLaser(globalCol, globalRow, side) {
    return { col: globalCol, row: globalRow, side, mode: "solid" };
}
/** @param {number} globalColStart @param {number} globalColEnd @param {number} globalRow */
function eastLaserRun(globalColStart, globalColEnd, globalRow) {
    /** @type {{ col: number, row: number, side: number, mode: string }[]} */
    const out = [];
    for (let col = globalColStart; col <= globalColEnd; col++) out.push(solidLaser(col, globalRow, 1));
    return out;
}
/** @param {number} globalCol @param {number} globalRowStart @param {number} globalRowEnd */
function southLaserRun(globalCol, globalRowStart, globalRowEnd) {
    /** @type {{ col: number, row: number, side: number, mode: string }[]} */
    const out = [];
    for (let row = globalRowStart; row <= globalRowEnd; row++) out.push(solidLaser(globalCol, row, 2));
    return out;
}
/**
 * Preconfigured sandbox demo: passage power, lasers, portal links, and access profiles.
 *
 * Layout (global cell coords):
 * - Row 10: power source → laser run → shared linked portal pair (powered, both-side access)
 * - Row 12: same network → one-way linked portal pair (both-side access)
 * - Col 22: isolated off-network portal (one-side access, owner cell only)
 */
export function buildSandboxStartSceneDoc() {
    const cellSize = gridSettings.cellSize;
    const powerCol = 8;
    const rowShared = 10;
    const rowOneWay = 12;
    const offCol = 22;
    const offSide = 1;
    const sharedPortalAKey = globalCanonicalEdgeKey(14, rowShared, 1);
    const sharedPortalBKey = globalCanonicalEdgeKey(16, rowShared, 3);
    const oneWayPortalCKey = globalCanonicalEdgeKey(14, rowOneWay, 1);
    const oneWayPortalDKey = globalCanonicalEdgeKey(16, rowOneWay, 3);
    const forcefields = [
        ...eastLaserRun(powerCol, 13, rowShared),
        solidLaser(15, rowShared, 1),
        ...eastLaserRun(powerCol, 13, rowOneWay),
        solidLaser(15, rowOneWay, 1),
        ...southLaserRun(13, rowShared, rowOneWay - 1),
        { col: offCol, row: rowOneWay, side: 1, mode: "tripwire" },
    ];
    const portals = [
        { col: 14, row: rowShared, side: 1, accessMode: PORTAL_ACCESS_MODE.Both, partnerKey: sharedPortalBKey },
        { col: 16, row: rowShared, side: 3, accessMode: PORTAL_ACCESS_MODE.Both, partnerKey: sharedPortalAKey },
        { col: 14, row: rowOneWay, side: 1, accessMode: PORTAL_ACCESS_MODE.Both, partnerKey: oneWayPortalDKey, linkMode: "oneWay", linkSourceKey: oneWayPortalCKey },
        { col: 16, row: rowOneWay, side: 3, accessMode: PORTAL_ACCESS_MODE.Both, partnerKey: oneWayPortalCKey, linkMode: "oneWay", linkSourceKey: oneWayPortalCKey },
        { col: offCol, row: rowShared, side: offSide, accessMode: PORTAL_ACCESS_MODE.One, allowedSide: portalAccessDefaultAllowedSide(offSide) },
    ];
    const half = cellSize * 0.5;
    const propCol = 12;
    const propRow = 11;
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize,
        origin: { minX: 0, minY: 0 },
        voxels: [],
        railWalls: [],
        forcefields,
        portals,
        floorBelts: [],
        powerSources: [{ col: powerCol, row: rowShared, defaultPowered: true }],
        props: [{ type: "beach_ball", x: propCol * cellSize + half, y: propRow * cellSize + half, facing: 0 }],
    };
}
/** Replace the current sandbox with the preconfigured start demo scene. */
export function spawnSandboxStartScene(state) {
    applySandboxSceneSnapshot(state, buildSandboxStartSceneDoc());
}
