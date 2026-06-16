import { getPropAsset } from "../Props/PropCatalog.js";
import { unionCellBoundsList } from "../DataStructures/CellRect.js";
import { emptyAabb, growAabbFromCenterInto, isEmptyAabb } from "../Math/Aabb2D.js";
import { cellToGlobalColRow, isCanonicalEdgeRepresentative } from "../Spatial/grid/gridCellTopology.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset } from "./sandboxCapabilities.js";
import { applyFloorBeltsFromGlobal, applyPassagePowerSourcesFromGlobal, listPlacedFloorBeltsForSnapshot, listPlacedPassagePowerSourcesForSnapshot } from "./floorOccupancy.js";
import { applyRoomGraphFromSnapshot, clearRoomGraph, collectRoomGraphForSnapshot, syncRoomGraphBake, unbakeRoomGraph } from "../RoomGraph/index.js";
import { recomputePortalSlotIndex } from "../Spatial/grid/portalSlotIndex.js";
import { notifyGridWallChange } from "./boundaryEdit.js";
import {
    applyStampedForcefieldsFromGlobal,
    applyStampedGridWallsFromGlobal,
    applyStampedPortalsFromGlobal,
    clearAllStampedGridWalls,
    getForcefieldInfo,
    getPortalInfo,
    listPlacedForcefields,
    listPlacedPortals,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
} from "./gridWallEdit.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { collectPlacedSandboxPropEntries, spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import { removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { PORTAL_ACCESS_MODE } from "../Spatial/grid/CellEdge.js";
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
export const SANDBOX_SCENE_SCHEMA_VERSION = 8;
/** @param {object} state */
export function collectSandboxSceneSnapshot(state) {
    const grid = state.obstacleGrid;
    const voxels = listPlacedVoxelWalls(grid).map(({ col, row, heightLevel }) => {
        const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
        return { col: globalCol, row: globalRow, heightLevel };
    });
    const railWalls = [];
    const listed = listPlacedRailWalls(grid);
    for (let i = 0; i < listed.length; i++) {
        const { col, row, side, heightLevel, thicknessLevel } = listed[i];
        if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
        const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
        railWalls.push({ col: globalCol, row: globalRow, side, heightLevel, thicknessLevel });
    }
    const forcefields = [];
    const listedForcefields = listPlacedForcefields(grid);
    for (let i = 0; i < listedForcefields.length; i++) {
        const { col, row, side } = listedForcefields[i];
        if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
        const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
        const info = getForcefieldInfo(grid, col, row, side);
        if (!info) continue;
        const entry = { col: globalCol, row: globalRow, side, mode: info.mode };
        if (info.mode === "oneWay") entry.allowedSide = info.allowedSide;
        forcefields.push(entry);
    }
    const portals = [];
    const listedPortals = listPlacedPortals(grid);
    for (let i = 0; i < listedPortals.length; i++) {
        const { col, row, side } = listedPortals[i];
        if (!isCanonicalEdgeRepresentative(grid, col, row, side)) continue;
        const { globalCol, globalRow } = cellToGlobalColRow(grid, col, row);
        const info = getPortalInfo(grid, col, row, side);
        if (!info) continue;
        const entry = { col: globalCol, row: globalRow, side, accessMode: PORTAL_ACCESS_MODE.One, allowedSide: info.mouthAllowedSide };
        if (info.partnerKey) entry.partnerKey = info.partnerKey;
        if (info.linkMode === "oneWay") {
            entry.linkMode = "oneWay";
            entry.linkSourceKey = info.linkSourceKey;
        }
        portals.push(entry);
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
        portals,
        floorBelts: listPlacedFloorBeltsForSnapshot(grid),
        powerSources: listPlacedPassagePowerSourcesForSnapshot(grid),
        props: collectPlacedSandboxPropEntries(state),
        roomGraph: collectRoomGraphForSnapshot(state, grid),
    };
}
/** @param {Record<string, unknown>} doc */
function normalizeSandboxSceneDoc(doc) {
    if (doc.schemaVersion === 7) {
        doc.schemaVersion = 8;
        if (!doc.roomGraph) doc.roomGraph = { nodes: [], links: [], nextNodeId: 0, nextLinkId: 0 };
    }
    return doc;
}
/** @param {unknown} raw */
export function parseSandboxSceneSnapshot(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") throw new Error("Scene JSON must be an object");
    normalizeSandboxSceneDoc(doc);
    // DO NOT VERIFY YET
    return doc;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function expandGridForSnapshot(state, doc) {
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    const cellHalfSize = state.obstacleGrid.cellHalfSize;
    const bounds = emptyAabb();
    const includeWorldPoint = (x, y) => growAabbFromCenterInto(bounds, x, y, cellHalfSize, cellHalfSize);
    for (let i = 0; i < doc.voxels.length; i++) {
        const { col, row } = doc.voxels[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.railWalls.length; i++) {
        const { col, row } = doc.railWalls[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.forcefields.length; i++) {
        const { col, row } = doc.forcefields[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.portals.length; i++) {
        const { col, row } = doc.portals[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.floorBelts.length; i++) {
        const { col, row } = doc.floorBelts[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.powerSources.length; i++) {
        const { col, row } = doc.powerSources[i];
        includeWorldPoint(col * cellSize + cellHalfSize, row * cellSize + cellHalfSize);
    }
    for (let i = 0; i < doc.props.length; i++) includeWorldPoint(doc.props[i].x, doc.props[i].y);
    for (let i = 0; i < doc.roomGraph.nodes.length; i++) {
        const node = doc.roomGraph.nodes[i];
        includeWorldPoint(node.col * cellSize + cellHalfSize, node.row * cellSize + cellHalfSize);
        includeWorldPoint((node.col + node.width - 1) * cellSize + cellHalfSize, (node.row + node.height - 1) * cellSize + cellHalfSize);
    }
    if (isEmptyAabb(bounds)) return;
    state.obstacleGrid.expandToCoverAabb(bounds);
}
/** @param {object} state */
function clearSandboxSceneContent(state) {
    for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state, { notify: false });
    getSandboxEntityMeta(state).clear();
    unbakeRoomGraph(state);
    clearRoomGraph(state);
    state.sandbox._passagePowerSyncKey = null;
    state.sandbox._boundaryNavPortalCount = 0;
    state.sandbox.passagePower = null;
    state.sandbox._passageEdgeDrawCache = null;
    state.obstacleGrid.portalSlotByKey.clear();
    state.obstacleGrid._vertexPassabilitySyncKey = "";
    state.obstacleGrid.vertexPassability = new Uint8Array(0);
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
    const portalBounds = applyStampedPortalsFromGlobal(state, doc.portals, cellSize);
    const beltBounds = applyFloorBeltsFromGlobal(state, doc.floorBelts, cellSize);
    const powerSourceBounds = applyPassagePowerSourcesFromGlobal(state, doc.powerSources, cellSize);
    const stampBounds = unionCellBoundsList([wallBounds, forcefieldBounds, portalBounds, beltBounds, powerSourceBounds]);
    const grid = state.obstacleGrid;
    grid.edgeStore.recomputePassageEdgeCount();
    recomputePortalSlotIndex(grid);
    syncPassagePowerNetwork(state);
    if (stampBounds) notifyGridWallChange(state, stampBounds);
    else if (grid.cols) notifyGridWallChange(state, { startCol: 0, endCol: grid.cols - 1, startRow: 0, endRow: grid.rows - 1 });
    applyRoomGraphFromSnapshot(state, doc.roomGraph, cellSize);
    syncRoomGraphBake(state);
    for (let i = 0; i < doc.props.length; i++) spawnSnapshotProp(state, doc.props[i]);
}
