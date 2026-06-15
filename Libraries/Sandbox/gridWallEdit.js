import { packCellKey } from "../DataStructures/CellKey.js";
import { centeredAabbInto, createAabb } from "../Math/Aabb2D.js";
import { canLinkPortalsOnNetwork, getPassageEdgeNetworkId } from "./passagePowerNetwork.js";
import { clearPrimaryBoundaryAt, commitBoundaryEdit, notifyGridWallChange } from "./boundaryEdit.js";
import { cellInRect, colRowToIndex } from "../Spatial/grid/GridUtils.js";
import {
    formatPassageModeLabel,
    isPassageLaserEdge,
    isPortalEdge,
    isRailWallEdge,
    parsePassageMode,
    parsePortalAccessMode,
    PASSAGE_MODE,
    PORTAL_ACCESS_MODE,
    railWallCapLevel,
} from "../Spatial/grid/CellEdge.js";
import { portalAccessDefaultAllowedSide, formatPortalAccessSideLabel, portalMouthAllowedSide } from "../Spatial/grid/portalAccess.js";
import { setBoundary, setPassageProfile, setPortalProfile, getBoundary } from "../Spatial/grid/boundaryOccupancy.js";
import {
    canonicalEdgeCellKey,
    cellIsStaticWall,
    cellIsStaticWallAtIdx,
    forEachGridEdge,
    gridCellToGlobalColRow,
    gridForcefieldEdge,
    gridNeighborFillLevel,
    gridPortalEdge,
    gridRailWallEdge,
    gridWallEdgeEndpoints,
} from "../World/wallGridCells.js";
import {
    findPortalEdgeByKey,
    formatPortalConnectionLabel,
    linkPortalEdges,
    parsePortalLinkMode,
    PORTAL_LINK_MODE,
    resolvePortalLinkRoute,
    resolvePortalPartner,
    setPortalLinkProfile,
    unlinkPortalEdge,
} from "./portalLinks.js";
import { clampStampWallHeightLevel } from "../WorldSurface/stampWallHeight.js";
const ENSURE_AABB = createAabb();
const EDGE_P1 = { x: 0, y: 0 };
const EDGE_P2 = { x: 0, y: 0 };
const EDGE_SIDE_LABELS = ["North (+Y)", "East (+X)", "South (-Y)", "West (-X)"];
/** @param {number} side */
export function formatGridWallEdgeSideLabel(side) {
    return EDGE_SIDE_LABELS[side] ?? `Side ${side}`;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function gridHasVoxelWall(grid, col, row) {
    return cellIsStaticWall(grid, col, row);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridHasRailWall(grid, col, row, side) {
    return gridRailWallEdge(grid, col, row, side) !== null;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridHasForcefield(grid, col, row, side) {
    return gridForcefieldEdge(grid, col, row, side) !== null;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function gridHasPortal(grid, col, row, side) {
    return gridPortalEdge(grid, col, row, side) !== null;
}
/**
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} [hitWorld]
 * @returns {{ col: number, row: number, side: number } | null}
 */
export function hitTestRailWallEdgeAtWorld(grid, worldX, worldY, hitWorld = grid.cellSize * 0.25) {
    const { col, row } = grid.worldToGrid(worldX, worldY);
    if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
    const bounds = grid.getCellBounds(col, row);
    const localX = worldX - bounds.minX;
    const localY = worldY - bounds.minY;
    const cellSize = grid.cellSize;
    const dists = [localY, cellSize - localX, cellSize - localY, localX];
    let bestSide = -1;
    let bestDist = hitWorld;
    for (let side = 0; side < 4; side++)
        if (dists[side] <= bestDist) {
            bestDist = dists[side];
            bestSide = side;
        }
    if (bestSide < 0) return null;
    return { col, row, side: bestSide };
}
/** @param {object} state @param {number} worldX @param {number} worldY */
export function ensureObstacleGridAtWorld(state, worldX, worldY) {
    const grid = state.obstacleGrid;
    centeredAabbInto(ENSURE_AABB, worldX, worldY, grid.cellSize, grid.cellSize);
    grid.expandToCoverAabb(ENSURE_AABB);
    return grid.worldToGrid(worldX, worldY);
}
/** @param {number} col @param {number} row */
function cellBounds(col, row) {
    return { startCol: col, endCol: col, startRow: row, endRow: row };
}
/** @param {object} state @param {{ col: number, row: number, side: number }[]} rails @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} */
export function clearRailWallsQuiet(state, rails) {
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    let changed = false;
    for (let i = 0; i < rails.length; i++) {
        const { col, row, side } = rails[i];
        if (clearPrimaryBoundaryAt(state, col, row, side) !== "railWall") continue;
        changed = true;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    }
    if (!changed) return null;
    return { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow };
}
/**
 * @param {object} state
 * @param {{ col: number, row: number, side: number, heightLevel?: number, thicknessLevel?: number }[]} railWalls
 * @returns {{ bounds: { startCol: number, endCol: number, startRow: number, endRow: number } | null, stamped: { col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[] }}
 */
export function stampRailWallsQuiet(state, railWalls) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} */
    const stamped = [];
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    for (let i = 0; i < railWalls.length; i++) {
        const wall = railWalls[i];
        const { col, row, side } = wall;
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        clearPrimaryBoundaryAt(state, col, row, side);
        const heightLevel = clampStampWallHeightLevel(wall.heightLevel ?? 1, settings);
        const thicknessLevel = wall.thicknessLevel ?? 1;
        setBoundary(grid, col, row, side, { kind: "railWall", capHeightLevel: heightLevel, thicknessLevel });
        stamped.push({ col, row, side, heightLevel, thicknessLevel });
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    }
    if (!stamped.length) return { bounds: null, stamped };
    return { bounds: { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow }, stamped };
}
/** @param {object} state @param {{ col: number, row: number, side: number, heightLevel?: number, thicknessLevel?: number }[]} railWalls */
export function stampRailWallsBatch(state, railWalls) {
    const { bounds, stamped } = stampRailWallsQuiet(state, railWalls);
    if (bounds) commitBoundaryEdit(state, bounds);
    return stamped;
}
/** @param {object} state @param {{ col: number, row: number, side: number }[]} rails */
export function clearRailWallsBatch(state, rails) {
    const bounds = clearRailWallsQuiet(state, rails);
    if (bounds) commitBoundaryEdit(state, bounds);
}
export function clearAllStampedGridWalls(state, { notify = true } = {}) {
    const grid = state.obstacleGrid;
    if (!grid.cols) return;
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
        grid.grid[idx] = 0;
    }
    for (let idx = 0; idx < size; idx++) {
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        for (let side = 0; side < 4; side++) clearPrimaryBoundaryAt(state, col, row, side);
    }
    if (notify) notifyGridWallChange(state, { startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 });
}
/**
 * Stamp many voxel/rail walls from global grid cells — one cache/nav invalidation at the end.
 * Call after `expandGridForSnapshot` so the grid already covers all cells.
 *
 * @param {object} state
 * @param {{ col: number, row: number, heightLevel: number }[]} voxels — global col/row
 * @param {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number }[]} railWalls
 * @param {number} cellSize
 * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null}
 */
export function applyStampedGridWallsFromGlobal(state, voxels, railWalls, cellSize) {
    const grid = state.obstacleGrid;
    const settings = state.worldSurfaces.settings;
    const half = cellSize * 0.5;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    /** @param {number} col @param {number} row */
    const mark = (col, row) => {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    };
    /** @param {number} globalCol @param {number} globalRow */
    const toLocal = (globalCol, globalRow) => {
        const x = globalCol * cellSize + half;
        const y = globalRow * cellSize + half;
        return grid.worldToGrid(x, y);
    };
    for (let i = 0; i < voxels.length; i++) {
        const { col: globalCol, row: globalRow, heightLevel } = voxels[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        const idx = colRowToIndex(col, row, grid.cols);
        if (grid.segmentGrid?.[idx]?.length) continue;
        grid.grid[idx] = clampStampWallHeightLevel(heightLevel, settings);
        mark(col, row);
    }
    for (let i = 0; i < railWalls.length; i++) {
        const { col: globalCol, row: globalRow, side, heightLevel, thicknessLevel } = railWalls[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        setBoundary(grid, col, row, side, { kind: "railWall", capHeightLevel: clampStampWallHeightLevel(heightLevel, settings), thicknessLevel });
        mark(col, row);
    }
    if (minCol === Infinity) return null;
    return { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow };
}
/**
 * @param {object} state
 * @param {{ col: number, row: number, side: number, mode?: string, allowedSide?: number }[]} forcefields
 * @param {number} cellSize
 * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null}
 */
export function applyStampedForcefieldsFromGlobal(state, forcefields, cellSize) {
    const grid = state.obstacleGrid;
    const half = cellSize * 0.5;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    /** @param {number} col @param {number} row */
    const mark = (col, row) => {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    };
    /** @param {number} globalCol @param {number} globalRow */
    const toLocal = (globalCol, globalRow) => {
        const x = globalCol * cellSize + half;
        const y = globalRow * cellSize + half;
        return grid.worldToGrid(x, y);
    };
    for (let i = 0; i < forcefields.length; i++) {
        const { col: globalCol, row: globalRow, side, mode, allowedSide } = forcefields[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        clearPrimaryBoundaryAt(state, col, row, side);
        if (!setBoundary(grid, col, row, side, { kind: "passage", mode: parsePassageMode(mode), allowedSide: allowedSide ?? side, powered: false })) continue;
        mark(col, row);
    }
    if (minCol === Infinity) return null;
    return { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow };
}
/**
 * @param {object} state
 * @param {{ col: number, row: number, side: number, accessMode?: string, allowedSide?: number, partnerKey?: number, linkMode?: string, linkSourceKey?: number }[]} portals
 * @param {number} cellSize
 * @returns {{ startCol: number, endCol: number, startRow: number, endRow: number } | null}
 */
export function applyStampedPortalsFromGlobal(state, portals, cellSize) {
    const grid = state.obstacleGrid;
    const half = cellSize * 0.5;
    let minCol = Infinity;
    let maxCol = -Infinity;
    let minRow = Infinity;
    let maxRow = -Infinity;
    /** @param {number} col @param {number} row */
    const mark = (col, row) => {
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
    };
    /** @param {number} globalCol @param {number} globalRow */
    const toLocal = (globalCol, globalRow) => {
        const x = globalCol * cellSize + half;
        const y = globalRow * cellSize + half;
        return grid.worldToGrid(x, y);
    };
    /** @type {{ col: number, row: number, side: number, partnerKey: number }[]} */
    const pendingLinks = [];
    for (let i = 0; i < portals.length; i++) {
        const { col: globalCol, row: globalRow, side, accessMode, allowedSide, partnerKey, linkMode, linkSourceKey } = portals[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        clearPrimaryBoundaryAt(state, col, row, side);
        const parsedAccess = PORTAL_ACCESS_MODE.One;
        if (
            !setBoundary(grid, col, row, side, {
                kind: "portal",
                accessMode: parsedAccess,
                allowedSide: allowedSide ?? portalAccessDefaultAllowedSide(side),
                partnerKey: 0,
                linkMode: parsePortalLinkMode(linkMode),
                linkSourceKey: linkSourceKey ?? 0,
                powered: false,
            })
        )
            continue;
        mark(col, row);
        if (partnerKey) pendingLinks.push({ col, row, side, partnerKey });
    }
    for (let i = 0; i < pendingLinks.length; i++) {
        const { col, row, side, partnerKey } = pendingLinks[i];
        const partner = findPortalEdgeByKey(grid, partnerKey);
        if (!partner) continue;
        linkPortalEdges(grid, col, row, side, partner.col, partner.row, partner.side);
    }
    for (let i = 0; i < portals.length; i++) {
        if (parsePortalLinkMode(portals[i].linkMode) !== PORTAL_LINK_MODE.OneWay) continue;
        const { col: globalCol, row: globalRow, side, linkSourceKey } = portals[i];
        const { col, row } = toLocal(globalCol, globalRow);
        if (!cellInRect(col, row, grid.cols, grid.rows)) continue;
        setPortalLinkProfile(grid, col, row, side, PORTAL_LINK_MODE.OneWay, linkSourceKey ?? 0);
    }
    if (minCol === Infinity) return null;
    return { startCol: minCol, endCol: maxCol, startRow: minRow, endRow: maxRow };
}
/** @param {object} state @param {number} col @param {number} row @param {number} heightLevel */
export function stampVoxelWallAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.segmentGrid?.[idx]?.length) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    grid.grid[idx] = level;
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row */
export function clearVoxelWallAt(state, col, row) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    const idx = colRowToIndex(col, row, grid.cols);
    if (!cellIsStaticWallAtIdx(grid, idx)) return false;
    grid.grid[idx] = 0;
    const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
    state.staticCellHealth.delete(packCellKey(globalCol, globalRow));
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} heightLevel */
export function setVoxelWallHeightAt(state, col, row, heightLevel) {
    const grid = state.obstacleGrid;
    if (!gridHasVoxelWall(grid, col, row)) return false;
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    const idx = colRowToIndex(col, row, grid.cols);
    if (grid.grid[idx] === level) return true;
    grid.grid[idx] = level;
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {number} heightLevel @param {number} thicknessLevel */
export function stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    clearPrimaryBoundaryAt(state, col, row, side);
    const level = clampStampWallHeightLevel(heightLevel, state.worldSurfaces.settings);
    setBoundary(grid, col, row, side, { kind: "railWall", capHeightLevel: level, thicknessLevel });
    commitBoundaryEdit(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side */
export function clearRailWallAt(state, col, row, side) {
    if (clearPrimaryBoundaryAt(state, col, row, side) !== "railWall") return false;
    commitBoundaryEdit(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {{ mode?: string, allowedSide?: number }} [profile] */
export function stampForcefieldAt(state, col, row, side, { mode = PASSAGE_MODE.Solid, allowedSide = side } = {}) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    clearPrimaryBoundaryAt(state, col, row, side);
    if (!setBoundary(grid, col, row, side, { kind: "passage", mode: parsePassageMode(mode), allowedSide, powered: false })) return false;
    commitBoundaryEdit(state, cellBounds(col, row), { power: true });
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {string} mode @param {number} allowedSide */
export function setForcefieldProfileAt(state, col, row, side, mode, allowedSide) {
    const grid = state.obstacleGrid;
    if (!setPassageProfile(grid, col, row, side, mode, allowedSide)) return false;
    notifyGridWallChange(state, cellBounds(col, row));
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side */
export function clearForcefieldAt(state, col, row, side) {
    if (clearPrimaryBoundaryAt(state, col, row, side) !== "passage") return false;
    commitBoundaryEdit(state, cellBounds(col, row), { power: true });
    return true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function getForcefieldInfo(grid, col, row, side) {
    const boundary = getBoundary(grid, col, row, side);
    if (boundary.primary !== "passage") return null;
    const mode = parsePassageMode(boundary.mode);
    return {
        col,
        row,
        side,
        mode,
        allowedSide: boundary.allowedSide ?? side,
        powered: boundary.powered === true,
        sideLabel: formatGridWallEdgeSideLabel(side),
        modeLabel: formatPassageModeLabel(mode),
    };
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {{ accessMode?: string, allowedSide?: number }} [profile] */
export function stampPortalAt(state, col, row, side, { accessMode = PORTAL_ACCESS_MODE.One, allowedSide = portalAccessDefaultAllowedSide(side) } = {}) {
    const grid = state.obstacleGrid;
    if (!cellInRect(col, row, grid.cols, grid.rows)) return false;
    clearPrimaryBoundaryAt(state, col, row, side);
    if (!setBoundary(grid, col, row, side, { kind: "portal", accessMode: parsePortalAccessMode(accessMode), allowedSide, partnerKey: 0, powered: false })) return false;
    commitBoundaryEdit(state, cellBounds(col, row), { power: true });
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {string} accessMode @param {number} allowedSide */
export function setPortalProfileAt(state, col, row, side, accessMode, allowedSide) {
    const grid = state.obstacleGrid;
    if (!setPortalProfile(grid, col, row, side, accessMode, allowedSide)) return false;
    commitBoundaryEdit(state, cellBounds(col, row), { nav: true });
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side */
export function clearPortalAt(state, col, row, side) {
    if (clearPrimaryBoundaryAt(state, col, row, side) !== "portal") return false;
    commitBoundaryEdit(state, cellBounds(col, row), { power: true });
    return true;
}
/** @param {object} state @param {number} colA @param {number} rowA @param {number} sideA @param {number} colB @param {number} rowB @param {number} sideB */
export function linkPortalsAt(state, colA, rowA, sideA, colB, rowB, sideB) {
    const grid = state.obstacleGrid;
    if (!canLinkPortalsOnNetwork(state, grid, colA, rowA, sideA, colB, rowB, sideB)) return false;
    if (!linkPortalEdges(grid, colA, rowA, sideA, colB, rowB, sideB)) return false;
    setPortalLinkProfile(grid, colA, rowA, sideA, PORTAL_LINK_MODE.Shared, 0);
    commitBoundaryEdit(state, [cellBounds(colA, rowA), cellBounds(colB, rowB)], { nav: true });
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side */
export function unlinkPortalAt(state, col, row, side) {
    const grid = state.obstacleGrid;
    if (!unlinkPortalEdge(grid, col, row, side)) return false;
    commitBoundaryEdit(state, cellBounds(col, row), { nav: true });
    return true;
}
/** @param {object} state @param {number} col @param {number} row @param {number} side @param {string} linkMode @param {number} [linkSourceKey] */
export function setPortalLinkProfileAt(state, col, row, side, linkMode, linkSourceKey = 0) {
    const grid = state.obstacleGrid;
    if (!setPortalLinkProfile(grid, col, row, side, linkMode, linkSourceKey)) return false;
    /** @type {{ startCol: number, endCol: number, startRow: number, endRow: number }[]} */
    const regions = [cellBounds(col, row)];
    const partner = resolvePortalPartner(grid, col, row, side);
    if (partner) regions.push(cellBounds(partner.col, partner.row));
    commitBoundaryEdit(state, regions, { nav: true });
    return true;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function getPortalInfo(grid, col, row, side) {
    const boundary = getBoundary(grid, col, row, side);
    if (boundary.primary !== "portal") return null;
    const edge = boundary.edge;
    const accessMode = boundary.accessMode;
    const partnerKey = boundary.partnerKey;
    const partner = partnerKey ? resolvePortalPartner(grid, col, row, side) : null;
    const linkMode = parsePortalLinkMode(edge.linkMode);
    const route = partner ? resolvePortalLinkRoute(grid, col, row, side) : null;
    let connection = "shared";
    if (linkMode === PORTAL_LINK_MODE.OneWay && route) connection = route.fromSelf ? "fromSelf" : "fromPartner";
    return {
        col,
        row,
        side,
        accessMode,
        allowedSide: boundary.allowedSide,
        mouthAllowedSide: portalMouthAllowedSide(edge, side),
        partnerKey,
        partner,
        linked: partner != null,
        linkMode,
        linkSourceKey: edge.linkSourceKey ?? 0,
        connection,
        powered: boundary.powered,
    };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} colA @param {number} rowA @param {number} sideA @param {number} colB @param {number} rowB @param {number} sideB */
export function isSamePortalEdge(grid, colA, rowA, sideA, colB, rowB, sideB) {
    return canonicalEdgeCellKey(grid, colA, rowA, sideA) === canonicalEdgeCellKey(grid, colB, rowB, sideB);
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function listPlacedPortals(grid) {
    /** @type {{ col: number, row: number, side: number, label: string }[]} */
    const placed = [];
    let index = 0;
    forEachGridEdge(
        grid,
        (col, row, side) => {
            const info = getPortalInfo(grid, col, row, side);
            index++;
            const sideLabel = formatGridWallEdgeSideLabel(side);
            const accessTag = ` · mouth ${formatPortalAccessSideLabel(side, info.mouthAllowedSide).toLowerCase()}`;
            const linkTag = info.linked ? ` · ${formatPortalConnectionLabel(info.linkMode, info.connection === "fromSelf")}` : " · unlinked";
            placed.push({ col, row, side, label: `Portal #${index} · ${sideLabel}${accessTag}${linkTag}` });
        },
        { canonicalOnly: true, filter: isPortalEdge },
    );
    return placed;
}
/** @param {object} state @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} selectedCol @param {number} selectedRow @param {number} selectedSide */
export function listPortalLinkTargets(state, grid, selectedCol, selectedRow, selectedSide) {
    const selectedNet = getPassageEdgeNetworkId(state, grid, selectedCol, selectedRow, selectedSide);
    if (selectedNet < 0) return [];
    return listPlacedPortals(grid).filter((entry) => {
        if (isSamePortalEdge(grid, entry.col, entry.row, entry.side, selectedCol, selectedRow, selectedSide)) return false;
        return getPassageEdgeNetworkId(state, grid, entry.col, entry.row, entry.side) === selectedNet;
    });
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function listPlacedForcefields(grid) {
    /** @type {{ col: number, row: number, side: number, label: string }[]} */
    const placed = [];
    let index = 0;
    forEachGridEdge(
        grid,
        (col, row, side, edge) => {
            const mode = parsePassageMode(edge.mode);
            index++;
            const sideLabel = formatGridWallEdgeSideLabel(side);
            const modeTag = mode === PASSAGE_MODE.Solid ? "" : ` · ${formatPassageModeLabel(mode)}`;
            placed.push({ col, row, side, label: `Forcefield #${index} · ${sideLabel}${modeTag}` });
        },
        { filter: isPassageLaserEdge },
    );
    return placed;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function listPlacedVoxelWalls(grid) {
    /** @type {{ col: number, row: number, heightLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    const size = grid.cols * grid.rows;
    for (let idx = 0; idx < size; idx++) {
        if (!cellIsStaticWallAtIdx(grid, idx)) continue;
        const col = idx % grid.cols;
        const row = (idx / grid.cols) | 0;
        const heightLevel = grid.grid[idx];
        const index = (counts.get(heightLevel) ?? 0) + 1;
        counts.set(heightLevel, index);
        placed.push({ col, row, heightLevel, label: `Voxel #${index} · height ${heightLevel}` });
    }
    return placed;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid */
export function listPlacedRailWalls(grid) {
    /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number, label: string }[]} */
    const placed = [];
    const counts = new Map();
    forEachGridEdge(
        grid,
        (col, row, side, edge) => {
            const capLevel = railWallCapLevel(edge, gridNeighborFillLevel(grid, col, row, side));
            const key = `${side}:${capLevel}:${edge.thicknessLevel}`;
            const index = (counts.get(key) ?? 0) + 1;
            counts.set(key, index);
            placed.push({ col, row, side, heightLevel: capLevel, thicknessLevel: edge.thicknessLevel, label: `Rail #${index} · ${formatGridWallEdgeSideLabel(side)} · height ${capLevel}` });
        },
        { filter: isRailWallEdge },
    );
    return placed;
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row */
export function getVoxelWallInfo(grid, col, row) {
    if (!gridHasVoxelWall(grid, col, row)) return null;
    const idx = colRowToIndex(col, row, grid.cols);
    return { col, row, heightLevel: grid.grid[idx] };
}
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
export function getRailWallInfo(grid, col, row, side) {
    const edge = grid.edgeStore.get(col, row, side, grid.cols);
    if (!isRailWallEdge(edge)) return null;
    const heightLevel = railWallCapLevel(edge, gridNeighborFillLevel(grid, col, row, side));
    return { col, row, side, heightLevel, thicknessLevel: edge.thicknessLevel, sideLabel: formatGridWallEdgeSideLabel(side) };
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number, side: number }} edge
 * @param {number} lineScale
 */
export function strokeSelectedRailWallEdge(ctx, grid, edge, lineScale) {
    gridWallEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    ctx.lineWidth = 3 * lineScale;
    ctx.beginPath();
    ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
    ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
    ctx.stroke();
}
/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid
 * @param {{ col: number, row: number, side: number }} edge
 * @param {number} lineScale
 */
export function strokeSelectedForcefieldEdge(ctx, grid, edge, lineScale) {
    gridWallEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    ctx.lineWidth = 4 * lineScale;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
    ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
    ctx.stroke();
    ctx.setLineDash([]);
}
export function strokeSelectedPortalEdge(ctx, grid, edge, lineScale) {
    gridWallEdgeEndpoints(grid, edge.col, edge.row, edge.side, EDGE_P1, EDGE_P2, 0);
    ctx.lineWidth = 4 * lineScale;
    ctx.setLineDash([4, 3, 10, 3]);
    ctx.beginPath();
    ctx.moveTo(EDGE_P1.x, EDGE_P1.y);
    ctx.lineTo(EDGE_P2.x, EDGE_P2.y);
    ctx.stroke();
    ctx.setLineDash([]);
}
