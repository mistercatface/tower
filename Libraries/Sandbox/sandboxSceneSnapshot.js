import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { gridCellToGlobalColRow, gridWallEdgeMirrorSide, gridWallEdgeNeighbor } from "../World/wallGridCells.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset } from "./sandboxCapabilities.js";
import { applyFloorBeltsFromGlobal, applyPassagePowerSourcesFromGlobal, listPlacedFloorBeltsForSnapshot, listPlacedPassagePowerSourcesForSnapshot } from "./floorOccupancy.js";
import {
    applyStampedForcefieldsFromGlobal,
    applyStampedGridWallsFromGlobal,
    clearAllStampedGridWalls,
    getForcefieldInfo,
    listPlacedForcefields,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    notifyStampedGridWallChange,
} from "./gridWallEdit.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { collectPlacedSandboxPropEntries, spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { removeSandboxWorldProp } from "./pullFixtureWalls.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { SANDBOX_DEFAULT_FACTION } from "../Combat/sandboxTargeting.js";
/**
 * Sandbox scene snapshot — copy/paste JSON for props, stamped grid walls, floor belts, and forcefields.
 *
 * `schemaVersion` is the live format only. No migration layer, no backwards-compatible
 * loaders, and no compat shims for older JSON yet. When the format changes, bump the
 * version and treat old paste blobs as invalid — save/load is not a stable product
 * boundary until we deliberately add that.
 */
/** Current snapshot format; bump when fields change (no vN→vN+1 migration code until then). */
export const SANDBOX_SCENE_SCHEMA_VERSION = 5;
/** @param {import("../Spatial/grid/WorldObstacleGrid.js").WorldObstacleGrid} grid @param {number} col @param {number} row @param {number} side */
function shouldEmitRailWall(grid, col, row, side) {
    const { nc, nr } = gridWallEdgeNeighbor(col, row, side);
    const nSide = gridWallEdgeMirrorSide(side);
    const a = gridCellToGlobalColRow(grid, col, row);
    const keyA = packEdgeCellKey(a.globalCol, a.globalRow, side);
    if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) return true;
    const b = gridCellToGlobalColRow(grid, nc, nr);
    const keyB = packEdgeCellKey(b.globalCol, b.globalRow, nSide);
    return keyA <= keyB;
}
/** @param {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} a @param {{ startCol: number, endCol: number, startRow: number, endRow: number } | null} b */
function unionStampBounds(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { startCol: Math.min(a.startCol, b.startCol), endCol: Math.max(a.endCol, b.endCol), startRow: Math.min(a.startRow, b.startRow), endRow: Math.max(a.endRow, b.endRow) };
}
/** @param {object} state */
export function collectSandboxSceneSnapshot(state) {
    const grid = state.obstacleGrid;
    const voxels = listPlacedVoxelWalls(grid).map(({ col, row, heightLevel }) => {
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        return { col: globalCol, row: globalRow, heightLevel };
    });
    const railWalls = [];
    const listed = listPlacedRailWalls(grid);
    for (let i = 0; i < listed.length; i++) {
        const { col, row, side, heightLevel, thicknessLevel } = listed[i];
        if (!shouldEmitRailWall(grid, col, row, side)) continue;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        railWalls.push({ col: globalCol, row: globalRow, side, heightLevel, thicknessLevel });
    }
    const forcefields = [];
    const listedForcefields = listPlacedForcefields(grid);
    for (let i = 0; i < listedForcefields.length; i++) {
        const { col, row, side } = listedForcefields[i];
        if (!shouldEmitRailWall(grid, col, row, side)) continue;
        const { globalCol, globalRow } = gridCellToGlobalColRow(grid, col, row);
        const info = getForcefieldInfo(grid, col, row, side);
        if (!info) continue;
        const entry = { col: globalCol, row: globalRow, side, mode: info.mode };
        if (info.mode === "oneWay") entry.allowedSide = info.allowedSide;
        forcefields.push(entry);
    }
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: grid.cellSize,
        origin: { minX: grid.minX, minY: grid.minY },
        cols: grid.cols,
        rows: grid.rows,
        voxels,
        railWalls,
        forcefields,
        floorBelts: listPlacedFloorBeltsForSnapshot(grid),
        powerSources: listPlacedPassagePowerSourcesForSnapshot(grid),
        props: collectPlacedSandboxPropEntries(state),
    };
}
/** @param {unknown} raw */
export function parseSandboxSceneSnapshot(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") throw new Error("Scene JSON must be an object");
    // Strict version match — intentional; do not add legacy schema adapters here yet.
    if (doc.schemaVersion !== SANDBOX_SCENE_SCHEMA_VERSION) throw new Error(`Unsupported schema version: ${doc.schemaVersion}`);
    if (!Array.isArray(doc.voxels)) throw new Error("Scene JSON missing voxels array");
    if (!Array.isArray(doc.railWalls)) throw new Error("Scene JSON missing railWalls array");
    if (!Array.isArray(doc.forcefields)) throw new Error("Scene JSON missing forcefields array");
    if (!Array.isArray(doc.floorBelts)) throw new Error("Scene JSON missing floorBelts array");
    if (!Array.isArray(doc.powerSources)) throw new Error("Scene JSON missing powerSources array");
    if (!Array.isArray(doc.props)) throw new Error("Scene JSON missing props array");
    return doc;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function expandGridForSnapshot(state, doc) {
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    const half = cellSize * 0.5;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    /** @param {number} x @param {number} y */
    const includeWorldPoint = (x, y) => {
        const cellMinX = x - half;
        const cellMinY = y - half;
        const cellMaxX = x + half;
        const cellMaxY = y + half;
        if (cellMinX < minX) minX = cellMinX;
        if (cellMinY < minY) minY = cellMinY;
        if (cellMaxX > maxX) maxX = cellMaxX;
        if (cellMaxY > maxY) maxY = cellMaxY;
    };
    for (let i = 0; i < doc.voxels.length; i++) {
        const { col, row } = doc.voxels[i];
        includeWorldPoint(col * cellSize + half, row * cellSize + half);
    }
    for (let i = 0; i < doc.railWalls.length; i++) {
        const { col, row } = doc.railWalls[i];
        includeWorldPoint(col * cellSize + half, row * cellSize + half);
    }
    for (let i = 0; i < doc.forcefields.length; i++) {
        const { col, row } = doc.forcefields[i];
        includeWorldPoint(col * cellSize + half, row * cellSize + half);
    }
    for (let i = 0; i < doc.floorBelts.length; i++) {
        const { col, row } = doc.floorBelts[i];
        includeWorldPoint(col * cellSize + half, row * cellSize + half);
    }
    for (let i = 0; i < doc.powerSources.length; i++) {
        const { col, row } = doc.powerSources[i];
        includeWorldPoint(col * cellSize + half, row * cellSize + half);
    }
    for (let i = 0; i < doc.props.length; i++) includeWorldPoint(doc.props[i].x, doc.props[i].y);
    if (!Number.isFinite(minX)) return;
    state.obstacleGrid.expandToCoverAabb({ minX, minY, maxX, maxY });
}
/** @param {object} state */
function clearSandboxSceneContent(state) {
    for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state, { notify: false });
    getSandboxEntityMeta(state).clear();
}
/** @param {object} state @param {{ type: string, x: number, y: number, facing?: number, faction?: string }} entry */
function spawnSnapshotProp(state, entry) {
    const asset = getPropAsset(entry.type);
    if (!asset) throw new Error(`Unknown prop type: ${entry.type}`);
    if (isGridFloorBeltSpawnAsset(asset)) return;
    if (isGridPassagePowerSourceSpawnAsset(asset)) return;
    spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction ?? SANDBOX_DEFAULT_FACTION, entry.facing ?? 0);
}
/**
 * @param {object} state
 * @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc
 * @param {{ mode?: "replace" | "merge" }} [options]
 */
export function applySandboxSceneSnapshot(state, doc, { mode = "replace" } = {}) {
    if (mode !== "replace") throw new Error("Only replace mode is supported");
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    if (cellSize !== state.obstacleGrid.cellSize) throw new Error(`Scene cellSize ${cellSize} does not match grid ${state.obstacleGrid.cellSize}`);
    clearSandboxSceneContent(state);
    expandGridForSnapshot(state, doc);
    const wallBounds = applyStampedGridWallsFromGlobal(state, doc.voxels, doc.railWalls, cellSize);
    const forcefieldBounds = applyStampedForcefieldsFromGlobal(state, doc.forcefields, cellSize);
    const beltBounds = applyFloorBeltsFromGlobal(state, doc.floorBelts, cellSize);
    const powerSourceBounds = applyPassagePowerSourcesFromGlobal(state, doc.powerSources, cellSize);
    const stampBounds = unionStampBounds(unionStampBounds(unionStampBounds(wallBounds, forcefieldBounds), beltBounds), powerSourceBounds);
    const grid = state.obstacleGrid;
    if (stampBounds) notifyStampedGridWallChange(state, stampBounds);
    else if (grid.cols) notifyStampedGridWallChange(state, { startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 });
    syncPassagePowerNetwork(state);
    for (let i = 0; i < doc.props.length; i++) spawnSnapshotProp(state, doc.props[i]);
}
