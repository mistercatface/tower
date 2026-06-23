import { worldPropAssets } from "../Props/PropCatalog.js";
import { emptyAabb, growAabbFromCenterInto, isEmptyAabb } from "../Math/Aabb2D.js";
import { cellToGlobalColRow, isCanonicalEdgeRepresentative } from "../Spatial/grid/gridCellTopology.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset } from "./sandboxCapabilities.js";
import { applyFloorBeltsFromGlobal, applyPassagePowerSourcesFromGlobal, listPlacedFloorBeltsForSnapshot, listPlacedPassagePowerSourcesForSnapshot } from "./floorOccupancy.js";
import { applyRoomGraphFromSnapshot, clearRoomGraph, collectRoomGraphForSnapshot, syncRoomGraphBake, unbakeRoomGraph } from "../RoomGraph/index.js";
import { commitGridNavEdit } from "./gridNavEdit.js";
import { GRID_NAV_EPOCH, bumpGridNavEpoch, setGridPassagePowerNavKey } from "../Spatial/grid/gridNavEpoch.js";
import { clearGridStampDrawCaches } from "./gridStampDrawCache.js";
import {
    applyStampedForcefieldsFromGlobal,
    applyStampedGridWallsFromGlobal,
    clearAllStampedGridWalls,
    getForcefieldInfo,
    listPlacedForcefields,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
} from "./gridWallEdit.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { findLiveWorldProp } from "../../GameState/EntityRegistry.js";
import { collectFlatPlacedSandboxPropEntries, spawnPlacedSandboxProp, removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { setChainHead } from "./chainLinks.js";
import { setCirclePropRadius } from "../Props/propScale.js";
import { applyKineticConstraintsFromSnapshot, clearKineticConstraints, collectKineticConstraintsSnapshot } from "../Motion/kineticConstraints.js";
import { applyPassagePowerGridState } from "./passagePowerNetwork.js";
import { SANDBOX_DEFAULT_FACTION } from "../Sandbox/sandboxFaction.js";
/**
 * Sandbox scene snapshot — copy/paste JSON for props, stamped grid walls, floor belts, and forcefields.
 *
 * `schemaVersion` is the live format only. No migration layer, no backwards-compatible
 * loaders, and no compat shims for older JSON yet. When the format changes, bump the
 * version and treat old paste blobs as invalid — save/load is not a stable product
 * boundary until we deliberately add that.
 */
/** Current snapshot format; bump when fields change (no vN→vN+1 migration code until then). */
export const SANDBOX_SCENE_SCHEMA_VERSION = 11;
/** @param {object} state */
export function collectSandboxSceneSnapshot(state) {
    const grid = state.obstacleGrid;
    const meta = getSandboxEntityMeta(state);
    const { props, propIdToIndex } = collectFlatPlacedSandboxPropEntries(state);
    const headProp = findLiveWorldProp(state.worldProps, (prop) => meta.isChainHead(prop.id));
    const chainHeadProp = headProp ? (propIdToIndex.get(headProp.id) ?? null) : null;
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
        props,
        kineticConstraints: collectKineticConstraintsSnapshot(state.kinetic, propIdToIndex),
        chainHeadProp,
        roomGraph: collectRoomGraphForSnapshot(state, grid),
    };
}
/** @param {unknown} raw */
export function parseSandboxSceneSnapshot(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") throw new Error("Scene JSON must be an object");
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
    clearKineticConstraints(state.kinetic);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state, { notify: false });
    getSandboxEntityMeta(state).clear();
    unbakeRoomGraph(state);
    clearRoomGraph(state);
    clearGridStampDrawCaches(state);
    setGridPassagePowerNavKey(state.obstacleGrid, "");
}
/** @param {object} state @param {{ type: string, x: number, y: number, facing?: number, faction?: string, width?: number, height?: number }} entry */
function spawnSnapshotProp(state, entry) {
    const asset = worldPropAssets[entry.type];
    if (!asset) throw new Error(`Unknown prop type: ${entry.type}`);
    if (isGridFloorBeltSpawnAsset(asset)) return null;
    if (isGridPassagePowerSourceSpawnAsset(asset)) return null;
    const halfExtents = entry.width != null && entry.height != null ? { x: entry.width / 2, y: entry.height / 2 } : undefined;
    const prop = spawnPlacedSandboxProp(state, entry.x, entry.y, entry.type, entry.faction ?? SANDBOX_DEFAULT_FACTION, entry.facing ?? 0, halfExtents, entry.visualOverride);
    if (entry.radius != null) setCirclePropRadius(prop, entry.radius);
    return prop;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function spawnSnapshotProps(state, doc) {
    const propRefs = new Array(doc.props.length);
    for (let i = 0; i < doc.props.length; i++) {
        const prop = spawnSnapshotProp(state, doc.props[i]);
        if (prop) propRefs[i] = prop;
    }
    if (doc.schemaVersion >= 9 && doc.kineticConstraints?.length) applyKineticConstraintsFromSnapshot(state.kinetic, doc.kineticConstraints, propRefs);
    if (doc.schemaVersion >= 9 && doc.chainHeadProp != null) {
        const headProp = propRefs[doc.chainHeadProp];
        if (headProp) setChainHead(state, getSandboxEntityMeta(state), headProp.id);
    }
}
/**
 * @param {object} state
 * @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc
 * @param {{ mode?: "replace" | "merge" }} [options]
 */
export async function applySandboxSceneSnapshot(state, doc, { mode = "replace" } = {}) {
    if (mode !== "replace") throw new Error("Only replace mode is supported");
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    if (cellSize !== state.obstacleGrid.cellSize) throw new Error(`Scene cellSize ${cellSize} does not match grid ${state.obstacleGrid.cellSize}`);
    clearSandboxSceneContent(state);
    expandGridForSnapshot(state, doc);
    const wallBounds = applyStampedGridWallsFromGlobal(state, doc.voxels, doc.railWalls, cellSize);
    const forcefieldBounds = applyStampedForcefieldsFromGlobal(state, doc.forcefields, cellSize);
    applyFloorBeltsFromGlobal(state, doc.floorBelts, cellSize);
    applyPassagePowerSourcesFromGlobal(state, doc.powerSources, cellSize);
    const grid = state.obstacleGrid;
    grid.edgeStore.recomputePassageEdgeCount();
    applyPassagePowerGridState(state);
    if (wallBounds || forcefieldBounds) bumpGridNavEpoch(grid, GRID_NAV_EPOCH.Wall);
    await commitGridNavEdit(state, null, { fullNavSync: true });
    applyRoomGraphFromSnapshot(state, doc.roomGraph, cellSize);
    syncRoomGraphBake(state);
    spawnSnapshotProps(state, doc);
}
