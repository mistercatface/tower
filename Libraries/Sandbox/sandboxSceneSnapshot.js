import { WorldProp } from "../../Entities/WorldProp.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { packEdgeCellKey } from "../DataStructures/CellKey.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getPropAsset } from "../Props/PropCatalog.js";
import { gridCellToGlobalColRow, gridWallEdgeMirrorSide, gridWallEdgeNeighbor } from "../World/wallGridCells.js";
import { isGridFloorBeltSpawnAsset, isPoolRackSpawnAsset } from "./sandboxCapabilities.js";
import { clearAllStampedGridWalls, ensureObstacleGridAtWorld, listPlacedRailWalls, listPlacedVoxelWalls, stampRailWallAt, stampVoxelWallAt } from "./gridWallEdit.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { spawnPoolRack } from "./spawnPoolRack.js";
import { removeSandboxWorldProp } from "./pullFixtureWalls.js";
export const SANDBOX_SCENE_SCHEMA_VERSION = 1;
/** @param {number} globalCol @param {number} globalRow @param {number} cellSize */
function worldCenterFromGlobalCell(globalCol, globalRow, cellSize) {
    const half = cellSize * 0.5;
    return { x: globalCol * cellSize + half, y: globalRow * cellSize + half };
}
/** @param {object} state @param {number} globalCol @param {number} globalRow @param {number} cellSize */
function localCellFromGlobal(state, globalCol, globalRow, cellSize) {
    const { x, y } = worldCenterFromGlobalCell(globalCol, globalRow, cellSize);
    ensureObstacleGridAtWorld(state, x, y);
    return state.obstacleGrid.worldToGrid(x, y);
}
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
/** @param {object} state */
function collectSnapshotProps(state) {
    const meta = getSandboxEntityMeta(state);
    /** @type {Map<string, object[]>} */
    const poolGroups = new Map();
    /** @type {{ type: string, x: number, y: number, facing: number, faction: string }[]} */
    const props = [];
    state.entityRegistry.forEachOfKind("worldProp", (prop) => {
        if (prop.isDead) return;
        const groupId = meta.getSpawnGroupId(prop.id);
        if (groupId?.startsWith("poolRack:")) {
            const group = poolGroups.get(groupId) ?? [];
            group.push(prop);
            poolGroups.set(groupId, group);
            return;
        }
        props.push({ type: prop.type, x: prop.x, y: prop.y, facing: prop.facing, faction: resolveSandboxFaction(prop) });
    });
    for (const group of poolGroups.values()) {
        const apex = group.find((prop) => prop.type === "pool_ball_1") ?? group[0];
        const rackType = group.length >= 14 ? "pool_rack_8ball" : "pool_rack_9ball";
        props.push({ type: rackType, x: apex.x, y: apex.y, facing: apex.facing, faction: resolveSandboxFaction(apex) });
    }
    return props;
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
    return {
        schemaVersion: SANDBOX_SCENE_SCHEMA_VERSION,
        cellSize: grid.cellSize,
        origin: { minX: grid.minX, minY: grid.minY },
        cols: grid.cols,
        rows: grid.rows,
        voxels,
        railWalls,
        props: collectSnapshotProps(state),
    };
}
/** @param {unknown} raw */
export function parseSandboxSceneSnapshot(raw) {
    const doc = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!doc || typeof doc !== "object") throw new Error("Scene JSON must be an object");
    if (doc.schemaVersion !== SANDBOX_SCENE_SCHEMA_VERSION) throw new Error(`Unsupported schema version: ${doc.schemaVersion}`);
    if (!Array.isArray(doc.voxels)) throw new Error("Scene JSON missing voxels array");
    if (!Array.isArray(doc.railWalls)) throw new Error("Scene JSON missing railWalls array");
    if (!Array.isArray(doc.props)) throw new Error("Scene JSON missing props array");
    return doc;
}
/** @param {object} state @param {ReturnType<typeof parseSandboxSceneSnapshot>} doc */
function expandGridForSnapshot(state, doc) {
    const cellSize = doc.cellSize ?? state.obstacleGrid.cellSize;
    const points = [];
    for (let i = 0; i < doc.voxels.length; i++) {
        const { col, row } = doc.voxels[i];
        points.push(worldCenterFromGlobalCell(col, row, cellSize));
    }
    for (let i = 0; i < doc.railWalls.length; i++) {
        const { col, row } = doc.railWalls[i];
        points.push(worldCenterFromGlobalCell(col, row, cellSize));
    }
    for (let i = 0; i < doc.props.length; i++) points.push({ x: doc.props[i].x, y: doc.props[i].y });
    for (let i = 0; i < points.length; i++) ensureObstacleGridAtWorld(state, points[i].x, points[i].y);
}
/** @param {object} state */
function clearSandboxSceneContent(state) {
    for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
    state.obstacleGrid.clearAllFloorCells();
    clearAllStampedGridWalls(state);
    getSandboxEntityMeta(state).clear();
}
/** @param {object} state @param {{ type: string, x: number, y: number, facing?: number, faction?: string }} entry */
function spawnSnapshotProp(state, entry) {
    const asset = getPropAsset(entry.type);
    if (!asset) throw new Error(`Unknown prop type: ${entry.type}`);
    if (isGridFloorBeltSpawnAsset(asset)) return;
    const faction = entry.faction ?? SANDBOX_DEFAULT_FACTION;
    if (isPoolRackSpawnAsset(asset)) {
        spawnPoolRack(state, entry.x, entry.y, asset.sandbox.spawnRack, faction);
        return;
    }
    const prop = new WorldProp(entry.x, entry.y, entry.type, entry.facing ?? 0);
    prop.faction = faction;
    addWorldPropToState(state, prop);
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
    for (let i = 0; i < doc.voxels.length; i++) {
        const { col, row, heightLevel } = doc.voxels[i];
        const local = localCellFromGlobal(state, col, row, cellSize);
        stampVoxelWallAt(state, local.col, local.row, heightLevel);
    }
    for (let i = 0; i < doc.railWalls.length; i++) {
        const { col, row, side, heightLevel, thicknessLevel } = doc.railWalls[i];
        const local = localCellFromGlobal(state, col, row, cellSize);
        stampRailWallAt(state, local.col, local.row, side, heightLevel, thicknessLevel);
    }
    for (let i = 0; i < doc.props.length; i++) spawnSnapshotProp(state, doc.props[i]);
}
