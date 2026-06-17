import { getPropAsset, formatPropTypeLabel } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction, formatSandboxFactionLabel } from "../Combat/sandboxTargeting.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import {
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isLockedRoomSpawnAsset,
    isRoomNodeSpawnAsset,
    isRoomLinkSpawnAsset,
    resolveFloorBeltKindFromSpawnAsset,
} from "./sandboxCapabilities.js";
import {
    clearRoomGraph,
    DEFAULT_ROOM_NODE_COLS,
    DEFAULT_ROOM_NODE_ROWS,
    addRoomLink,
    clearRoomLinksForNode,
    formatRoomLinkLabel,
    formatRoomLinkCorridorLabel,
    formatRoomNodeLabel,
    getRoomLink,
    getRoomNode,
    listRoomLinks,
    listRoomNodes,
    listRoomLinkCorridorSceneEntries,
    listRoomNodeCorridorEntries,
    roomLinkCorridorLaneCount,
    pickRoomNodeAt,
    removeRoomLink,
    removeRoomNode,
    stampRoomNodeAt,
    stampLockedRoomNodeAt,
    updateRoomLink,
    syncRoomGraphBake,
    unbakeRoomGraph,
    rerollRoomLinkBake,
    expandGridForRoomNodeFootprint,
} from "../RoomGraph/index.js";
import { linkCorridorLimits, MAX_CORRIDOR_COUNT, resolveLinkCorridorRoll } from "../RoomGraph/roomGraphLinkCorridor.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { createSeededRng } from "../Math/SeededRng.js";
import { canStampFloorBeltAt, clearPassagePowerSourceAt, GRID_ROTATABLE_OCCUPANT, pickRotatableGridOccupantAtWorld, rotateGridOccupantAt, stampPassagePowerSourceAt } from "./floorOccupancy.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import {
    clearForcefieldAt,
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    getForcefieldInfo,
    getRailWallInfo,
    getVoxelWallInfo,
    hitTestRailWallEdgeAtWorld,
    listPlacedForcefields,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    setForcefieldProfileAt,
    stampRailWallAt,
    setVoxelWallHeightAt,
    stampForcefieldAt,
    stampVoxelWallAt,
} from "./gridWallEdit.js";
import { PASSAGE_MODE } from "../Spatial/grid/CellEdge.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { cellIsStaticWall, forcefieldEdgeAt, railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
/** @param {object} state @param {{ defaultSpawnPropId: string }} options */
export function createSandboxSession(state, { defaultSpawnPropId }) {
    let spawnPropId = defaultSpawnPropId;
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    let selectedPropIds = new Set();
    let selectedPropId = null;
    /** @type {{ col: number, row: number } | null} */
    let selectedFloorCell = null;
    /** @type {string} prop:id or wall:voxel|rail|forcefield */
    let placePaletteKey = `prop:${defaultSpawnPropId}`;
    /** @type {'voxel' | 'rail' | 'forcefield'} */
    let wallStampMode = "voxel";
    let wallHeightLevel = 4;
    let railThicknessLevel = 2;
    let forcefieldStampMode = PASSAGE_MODE.Solid;
    let spawnRoomNodeCols = DEFAULT_ROOM_NODE_COLS;
    let spawnRoomNodeRows = DEFAULT_ROOM_NODE_ROWS;
    let spawnCorridorType = CORRIDOR_TYPE_EMPTY;
    let spawnCorridorWidth = 1;
    /** @type {{ col: number, row: number } | null} */
    let selectedVoxelCell = null;
    /** @type {{ col: number, row: number, side: number } | null} */
    let selectedRailEdge = null;
    /** @type {number | null} */
    let selectedRoomNodeId = null;
    /** @type {number | null} */
    let selectedRoomLinkId = null;
    /** @type {number} */
    let selectedRoomLinkCorridorIndex = 0;
    /** @type {(() => void) | null} */
    let uiSync = null;
    let nextPlacementSeq = 1;
    /** @type {Map<string, number>} */
    const placementSeqByKey = new Map();
    const propPlacementKey = (id) => `prop:${id}`;
    const floorPlacementKey = (col, row) => `floor:${col},${row}`;
    const voxelPlacementKey = (col, row) => `voxel:${col},${row}`;
    const edgePlacementKey = (kind, col, row, side) => `${kind}:${col},${row},${side}`;
    const touchPropPlacement = (id) => {
        const key = propPlacementKey(id);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const touchFloorPlacement = (col, row) => {
        const key = floorPlacementKey(col, row);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const touchVoxelPlacement = (col, row) => {
        const key = voxelPlacementKey(col, row);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const touchEdgePlacement = (kind, col, row, side) => {
        const key = edgePlacementKey(kind, col, row, side);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const forgetPropPlacement = (id) => placementSeqByKey.delete(propPlacementKey(id));
    const forgetFloorPlacement = (col, row) => placementSeqByKey.delete(floorPlacementKey(col, row));
    const forgetVoxelPlacement = (col, row) => placementSeqByKey.delete(voxelPlacementKey(col, row));
    const forgetEdgePlacement = (kind, col, row, side) => placementSeqByKey.delete(edgePlacementKey(kind, col, row, side));
    const roomNodePlacementKey = (id) => `roomNode:${id}`;
    const roomLinkPlacementKey = (linkId, corridorIndex) => `roomLink:${linkId}:${corridorIndex}`;
    const touchRoomNodePlacement = (id) => {
        const key = roomNodePlacementKey(id);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const touchRoomLinkPlacement = (linkId, corridorIndex) => {
        const key = roomLinkPlacementKey(linkId, corridorIndex);
        if (!placementSeqByKey.has(key)) placementSeqByKey.set(key, nextPlacementSeq++);
    };
    const forgetRoomNodePlacement = (id) => placementSeqByKey.delete(roomNodePlacementKey(id));
    const forgetRoomLinkPlacement = (linkId) => {
        const prefix = `roomLink:${linkId}:`;
        for (const key of placementSeqByKey.keys()) if (key.startsWith(prefix)) placementSeqByKey.delete(key);
    };
    const touchRoomLinkCorridors = (link) => {
        const count = roomLinkCorridorLaneCount(link);
        for (let ci = 0; ci < count; ci++) touchRoomLinkPlacement(link.id, ci);
    };
    const resetPlacementOrder = () => {
        placementSeqByKey.clear();
        nextPlacementSeq = 1;
    };
    const placementSeq = (key, fallback) => placementSeqByKey.get(key) ?? fallback;
    /** Hand-placed voxels only — bulk cavern/map-gen stamps are not tracked here. */
    const listTrackedVoxelWalls = () => {
        const grid = state.obstacleGrid;
        /** @type {{ col: number, row: number, heightLevel: number, label: string }[]} */
        const placed = [];
        for (const key of placementSeqByKey.keys()) {
            if (!key.startsWith("voxel:")) continue;
            const coords = key.slice(6);
            const comma = coords.indexOf(",");
            const col = Number(coords.slice(0, comma));
            const row = Number(coords.slice(comma + 1));
            if (!cellIsStaticWall(grid, col, row)) continue;
            const heightLevel = grid.grid[col + row * grid.cols];
            placed.push({ col, row, heightLevel, label: `Voxel · (${col},${row}) · height ${heightLevel}` });
        }
        placed.sort((a, b) => placementSeq(voxelPlacementKey(a.col, a.row), 0) - placementSeq(voxelPlacementKey(b.col, b.row), 0));
        return placed;
    };
    /** Hand-placed rails only — bulk map-gen / quiet stamps are not tracked here. */
    const listTrackedRailWalls = () => {
        const grid = state.obstacleGrid;
        /** @type {{ col: number, row: number, side: number, heightLevel: number, thicknessLevel: number, label: string }[]} */
        const placed = [];
        const prefix = "rail:";
        for (const key of placementSeqByKey.keys()) {
            if (!key.startsWith(prefix)) continue;
            const parts = key.slice(prefix.length).split(",");
            const col = Number(parts[0]);
            const row = Number(parts[1]);
            const side = Number(parts[2]);
            if (!railWallEdgeAt(grid, col, row, side)) continue;
            const info = getRailWallInfo(grid, col, row, side);
            if (!info) continue;
            placed.push({ col, row, side, heightLevel: info.heightLevel, thicknessLevel: info.thicknessLevel, label: `Rail · (${col},${row}) · ${info.sideLabel} · height ${info.heightLevel}` });
        }
        placed.sort((a, b) => placementSeq(edgePlacementKey("rail", a.col, a.row, a.side), 0) - placementSeq(edgePlacementKey("rail", b.col, b.row, b.side), 0));
        return placed;
    };
    function notifyUi() {
        uiSync?.();
    }
    const registry = () => state.entityRegistry;
    const meta = () => getSandboxEntityMeta(state);
    const syncPrimaryFromSet = () => {
        if (selectedPropIds.size === 0) {
            selectedPropId = null;
            return;
        }
        if (selectedPropId != null && selectedPropIds.has(selectedPropId) && registry().getLive(selectedPropId)) return;
        for (const id of selectedPropIds)
            if (registry().getLive(id)) {
                selectedPropId = id;
                return;
            }
        selectedPropIds.clear();
        selectedPropId = null;
    };
    const dropRoomGraphSelection = () => {
        selectedRoomNodeId = null;
        selectedRoomLinkId = null;
        selectedRoomLinkCorridorIndex = 0;
    };
    const dropFloorSelection = () => {
        if (selectedFloorCell == null) return;
        selectedFloorCell = null;
    };
    const dropWallSelection = () => {
        selectedVoxelCell = null;
        selectedRailEdge = null;
    };
    const setSelectedVoxelCell = (col, row) => {
        dropFloorSelection();
        dropRoomGraphSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedRailEdge = null;
        selectedVoxelCell = { col, row };
        notifyUi();
    };
    const setSelectedRailEdge = (col, row, side) => {
        dropFloorSelection();
        dropRoomGraphSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedVoxelCell = null;
        selectedRailEdge = { col, row, side };
        notifyUi();
    };
    const setSinglePropSelection = (id) => {
        if (id == null) {
            selectedPropIds.clear();
            selectedPropId = null;
            notifyUi();
            return;
        }
        dropFloorSelection();
        dropWallSelection();
        dropRoomGraphSelection();
        selectedPropIds = new Set([id]);
        selectedPropId = id;
        notifyUi();
    };
    const setSelectedRoomNodeId = (id) => {
        dropFloorSelection();
        dropWallSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedRoomLinkId = null;
        selectedRoomLinkCorridorIndex = 0;
        selectedRoomNodeId = id;
        notifyUi();
    };
    const setSelectedRoomLinkId = (id, corridorIndex = 0) => {
        dropFloorSelection();
        dropWallSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedRoomLinkId = id;
        selectedRoomLinkCorridorIndex = id == null ? 0 : corridorIndex;
        if (id != null && selectedRoomNodeId != null) {
            const link = getRoomLink(state, id);
            if (link && link.a !== selectedRoomNodeId && link.b !== selectedRoomNodeId) selectedRoomNodeId = null;
        }
        notifyUi();
    };
    const setSelectedRoomLinkFromScene = (linkId, corridorIndex = 0) => {
        dropFloorSelection();
        dropWallSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedRoomNodeId = null;
        selectedRoomLinkId = linkId;
        selectedRoomLinkCorridorIndex = corridorIndex;
        notifyUi();
    };
    const setSelectedFloorCell = (col, row) => {
        selectedPropIds.clear();
        selectedPropId = null;
        dropWallSelection();
        dropRoomGraphSelection();
        selectedFloorCell = { col, row };
        notifyUi();
    };
    const removeProp = (prop) => removeSandboxWorldProp(state, prop);
    const pruneSelection = () => {
        if (selectedPropIds.size === 0) return;
        let changed = false;
        for (const id of selectedPropIds)
            if (!registry().getLive(id)) {
                selectedPropIds.delete(id);
                changed = true;
            }
        if (changed) {
            syncPrimaryFromSet();
            notifyUi();
        }
    };
    const removePropFromSelection = (propId) => {
        if (!selectedPropIds.delete(propId)) return;
        if (selectedPropId === propId) syncPrimaryFromSet();
    };
    /** @returns {boolean} */
    const spawnAt = (worldX, worldY) => {
        const asset = getPropAsset(spawnPropId);
        if (!asset) return false;
        if (isGridFloorBeltSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!canStampFloorBeltAt(state, col, row)) return false;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!grid.writeFloorCell(col, row, kind, 0)) return false;
            markGridZoneSubscriptionsDirty(state);
            touchFloorPlacement(col, row);
            setSelectedFloorCell(col, row);
            return true;
        }
        if (isGridPassagePowerSourceSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, false)) return false;
            touchFloorPlacement(col, row);
            setSelectedFloorCell(col, row);
            return true;
        }
        if (isRoomNodeSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            expandGridForRoomNodeFootprint(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows);
            const node = isLockedRoomSpawnAsset(asset)
                ? stampLockedRoomNodeAt(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows)
                : stampRoomNodeAt(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows);
            if (!node) return false;
            touchRoomNodePlacement(node.id);
            setSelectedRoomNodeId(node.id);
            syncRoomGraphBake(state);
            notifyUi();
            return true;
        }
        if (isRoomLinkSpawnAsset(asset)) return false;
        const spawned = spawnPlacedSandboxProp(state, worldX, worldY, spawnPropId, spawnFaction);
        if (spawned) {
            touchPropPlacement(spawned.id);
            setSinglePropSelection(spawned.id);
        }
        return spawned != null;
    };
    return {
        getSpawnPropId: () => spawnPropId,
        setSpawnPropId: (id) => {
            spawnPropId = id;
            if (!placePaletteKey.startsWith("wall:")) placePaletteKey = `prop:${id}`;
        },
        getSpawnFaction: () => spawnFaction,
        setSpawnFaction: (faction) => {
            spawnFaction = faction;
        },
        getSpawnRoomNodeCols: () => spawnRoomNodeCols,
        setSpawnRoomNodeCols: (cols) => {
            spawnRoomNodeCols = Math.max(1, Math.min(32, Math.round(cols)));
            notifyUi();
        },
        getSpawnRoomNodeRows: () => spawnRoomNodeRows,
        setSpawnRoomNodeRows: (rows) => {
            spawnRoomNodeRows = Math.max(1, Math.min(32, Math.round(rows)));
            notifyUi();
        },
        getSpawnCorridorType: () => spawnCorridorType,
        setSpawnCorridorType: (type) => {
            spawnCorridorType = normalizeCorridorType(type);
            notifyUi();
        },
        getSpawnCorridorWidth: () => spawnCorridorWidth,
        setSpawnCorridorWidth: (width) => {
            spawnCorridorWidth = Math.max(1, Math.min(8, Math.round(width)));
            notifyUi();
        },
        getSelectedPropId: () => selectedPropId,
        getSelectedPropIds: () => {
            pruneSelection();
            return [...selectedPropIds];
        },
        setSelectedPropId: (id) => {
            setSinglePropSelection(id);
        },
        setSelectedPropIds: (ids) => {
            dropFloorSelection();
            dropWallSelection();
            selectedPropIds = new Set();
            for (let i = 0; i < ids.length; i++) {
                const id = ids[i];
                if (registry().getLive(id)) selectedPropIds.add(id);
            }
            syncPrimaryFromSet();
            notifyUi();
        },
        clearPropSelection: () => {
            setSinglePropSelection(null);
        },
        clearRoomGraphSelection: () => {
            dropRoomGraphSelection();
            notifyUi();
        },
        getSelectedFloorCell: () => selectedFloorCell,
        setSelectedFloorCell,
        clearFloorSelection: () => {
            dropFloorSelection();
            notifyUi();
        },
        rotateSelectedFloorBelt(steps = 1) {
            if (!selectedFloorCell) return false;
            const { col, row } = selectedFloorCell;
            const idx = col + row * state.obstacleGrid.cols;
            if (!state.obstacleGrid.floorStore.isBeltKindAtIdx(idx)) {
                dropFloorSelection();
                notifyUi();
                return false;
            }
            if (!rotateGridOccupantAt(state, { col, row, kind: GRID_ROTATABLE_OCCUPANT.FloorBelt }, steps)) return false;
            notifyUi();
            return true;
        },
        rotateHoveredGridOccupantAtWorld(worldX, worldY, steps = 1) {
            const occupant = pickRotatableGridOccupantAtWorld(state, worldX, worldY);
            if (!occupant) return false;
            if (!rotateGridOccupantAt(state, occupant, steps)) return false;
            setSelectedFloorCell(occupant.col, occupant.row);
            return true;
        },
        moveSelectedFloorBeltTo(targetCol, targetRow) {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (col === targetCol && row === targetRow) return true;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                dropFloorSelection();
                notifyUi();
                return false;
            }
            if (!canStampFloorBeltAt(state, targetCol, targetRow)) return false;
            const kind = grid.floorStore.kind[idx];
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            grid.clearFloorCell(col, row);
            if (!grid.writeFloorCell(targetCol, targetRow, kind, facingRadians)) {
                grid.writeFloorCell(col, row, kind, facingRadians);
                return false;
            }
            setSelectedFloorCell(targetCol, targetRow);
            markGridZoneSubscriptionsDirty(state);
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                dropFloorSelection();
                notifyUi();
                return false;
            }
            if (grid.floorStore.kind[idx] === kind) return true;
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            grid.writeFloorCell(col, row, kind, facingRadians);
            markGridZoneSubscriptionsDirty(state);
            notifyUi();
            return true;
        },
        deleteSelectedFloorCell() {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) {
                if (!clearPassagePowerSourceAt(state, col, row)) return false;
            } else if (!grid.clearFloorCell(col, row)) return false;
            else markGridZoneSubscriptionsDirty(state);
            forgetFloorPlacement(col, row);
            dropFloorSelection();
            notifyUi();
            return true;
        },
        getSelectedFloorBeltInfo() {
            if (!selectedFloorCell) return null;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) return null;
            const kind = grid.floorStore.kind[idx];
            const facingIndex = grid.floorStore.facing[idx];
            return { col, row, kind, facingIndex, kindLabel: formatFloorBeltKindLabel(kind), facingLabel: formatFloorBeltFacingLabel(facingIndex) };
        },
        getSelectedPassagePowerSourceInfo() {
            if (!selectedFloorCell) return null;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return null;
            return { col, row, defaultPowered: grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx) };
        },
        setSelectedPassagePowerSourceDefaultPowered(powered) {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return false;
            grid.floorStore.setPassagePowerSourceAtIdx(idx, powered);
            syncPassagePowerNetwork(state);
            notifyUi();
            return true;
        },
        getPlacePaletteKey: () => placePaletteKey,
        isWallPlaceMode: () => placePaletteKey.startsWith("wall:"),
        isMapGenPlaceMode: () => placePaletteKey.startsWith("gen:"),
        setPlacePaletteKey(key) {
            if (placePaletteKey === key) return;
            placePaletteKey = key;
            if (key.startsWith("wall:")) {
                wallStampMode = /** @type {'voxel' | 'rail' | 'forcefield'} */ (key.slice(5));
                selectedPropIds.clear();
                selectedPropId = null;
                dropFloorSelection();
            } else if (key.startsWith("prop:")) {
                spawnPropId = key.slice(5);
                dropWallSelection();
            } else if (key.startsWith("gen:")) {
                selectedPropIds.clear();
                selectedPropId = null;
                dropFloorSelection();
                dropWallSelection();
            }
            notifyUi();
        },
        getWallStampMode: () => wallStampMode,
        setWallStampMode(mode) {
            wallStampMode = mode;
            notifyUi();
        },
        getWallHeightLevel: () => wallHeightLevel,
        setWallHeightLevel(level) {
            wallHeightLevel = level;
            notifyUi();
        },
        getRailThicknessLevel: () => railThicknessLevel,
        setRailThicknessLevel(level) {
            railThicknessLevel = level;
            notifyUi();
        },
        getForcefieldStampMode: () => forcefieldStampMode,
        setForcefieldStampMode(mode) {
            forcefieldStampMode = mode;
            notifyUi();
        },
        getSelectedVoxelCell: () => selectedVoxelCell,
        getSelectedRailEdge: () => selectedRailEdge,
        setSelectedVoxelCell,
        setSelectedRailEdge,
        clearWallSelection: () => {
            dropWallSelection();
            notifyUi();
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        listPlacedForcefields: () => listPlacedForcefields(state.obstacleGrid),
        getSelectedVoxelWallInfo: () => (selectedVoxelCell ? getVoxelWallInfo(state.obstacleGrid, selectedVoxelCell.col, selectedVoxelCell.row) : null),
        getSelectedRailWallInfo: () =>
            selectedRailEdge && railWallEdgeAt(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getRailWallInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null,
        getSelectedForcefieldInfo: () =>
            selectedRailEdge && forcefieldEdgeAt(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getForcefieldInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null,
        setSelectedForcefieldMode(mode) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col, row, side);
            if (!info) return false;
            const allowedSide = mode === PASSAGE_MODE.OneWay ? (info.mode === PASSAGE_MODE.OneWay ? (info.allowedSide ?? side) : side) : side;
            if (!setForcefieldProfileAt(state, col, row, side, mode, allowedSide)) return false;
            notifyUi();
            return true;
        },
        setSelectedForcefieldAllowedSide(allowedSide) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col, row, side);
            if (!info || info.mode !== PASSAGE_MODE.OneWay) return false;
            if (!setForcefieldProfileAt(state, col, row, side, PASSAGE_MODE.OneWay, allowedSide)) return false;
            notifyUi();
            return true;
        },
        stampWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                if (forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) {
                    setSelectedRailEdge(hit.col, hit.row, hit.side);
                    return true;
                }
                if (!stampForcefieldAt(state, hit.col, hit.row, hit.side, { mode: forcefieldStampMode, allowedSide: hit.side })) return false;
                touchEdgePlacement("forcefield", hit.col, hit.row, hit.side);
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (railWallEdgeAt(state.obstacleGrid, hit.col, hit.row, hit.side)) {
                    setSelectedRailEdge(hit.col, hit.row, hit.side);
                    return true;
                }
                if (!stampRailWallAt(state, hit.col, hit.row, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                touchEdgePlacement("rail", hit.col, hit.row, hit.side);
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            if (cellIsStaticWall(state.obstacleGrid, col, row)) {
                setSelectedVoxelCell(col, row);
                return true;
            }
            if (!stampVoxelWallAt(state, col, row, wallHeightLevel)) return false;
            touchVoxelPlacement(col, row);
            setSelectedVoxelCell(col, row);
            return true;
        },
        stampWallAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.stampWallAtWorld(origin.x, origin.y);
        },
        setSelectedVoxelWallHeight(heightLevel) {
            if (!selectedVoxelCell) return false;
            const { col, row } = selectedVoxelCell;
            if (!setVoxelWallHeightAt(state, col, row, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            if (!stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            if (!selectedRailEdge) return false;
            const grid = state.obstacleGrid;
            const { col, row, side } = selectedRailEdge;
            const info = getRailWallInfo(grid, col, row, side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, col, row, newSide)) return false;
            if (!clearRailWallAt(state, col, row, side)) return false;
            if (!stampRailWallAt(state, col, row, newSide, info.heightLevel, info.thicknessLevel)) return false;
            setSelectedRailEdge(col, row, newSide);
            return true;
        },
        deleteSelectedWall() {
            if (selectedVoxelCell) {
                const { col, row } = selectedVoxelCell;
                if (!clearVoxelWallAt(state, col, row)) return false;
                forgetVoxelPlacement(col, row);
                dropWallSelection();
                notifyUi();
                return true;
            }
            if (selectedRailEdge) {
                const { col, row, side } = selectedRailEdge;
                const grid = state.obstacleGrid;
                if (forcefieldEdgeAt(grid, col, row, side)) {
                    if (!clearForcefieldAt(state, col, row, side)) return false;
                    forgetEdgePlacement("forcefield", col, row, side);
                } else if (!clearRailWallAt(state, col, row, side)) return false;
                else forgetEdgePlacement("rail", col, row, side);
                dropWallSelection();
                notifyUi();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail" || wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                if (wallStampMode === "forcefield") {
                    if (!forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                    if (!clearForcefieldAt(state, hit.col, hit.row, hit.side)) return false;
                    forgetEdgePlacement("forcefield", hit.col, hit.row, hit.side);
                } else {
                    if (!railWallEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                    if (!clearRailWallAt(state, hit.col, hit.row, hit.side)) return false;
                    forgetEdgePlacement("rail", hit.col, hit.row, hit.side);
                }
                if (selectedRailEdge?.col === hit.col && selectedRailEdge.row === hit.row && selectedRailEdge.side === hit.side) dropWallSelection();
                notifyUi();
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!clearVoxelWallAt(state, col, row)) return false;
            forgetVoxelPlacement(col, row);
            if (selectedVoxelCell?.col === col && selectedVoxelCell.row === row) dropWallSelection();
            notifyUi();
            return true;
        },
        pickAnyWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const edgeHit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (edgeHit) {
                const { col, row, side } = edgeHit;
                if (forcefieldEdgeAt(grid, col, row, side)) {
                    placePaletteKey = "wall:forcefield";
                    wallStampMode = "forcefield";
                    setSelectedRailEdge(col, row, side);
                    return true;
                }
                if (railWallEdgeAt(grid, col, row, side)) {
                    placePaletteKey = "wall:rail";
                    wallStampMode = "rail";
                    setSelectedRailEdge(col, row, side);
                    return true;
                }
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!cellIsStaticWall(grid, col, row)) return false;
            placePaletteKey = "wall:voxel";
            wallStampMode = "voxel";
            setSelectedVoxelCell(col, row);
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !railWallEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!cellIsStaticWall(grid, col, row)) return false;
            setSelectedVoxelCell(col, row);
            return true;
        },
        /** Pick a stamped forcefield edge from the map (Props tab or any panel). */
        pickForcefieldAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (!hit || !forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
            setSelectedRailEdge(hit.col, hit.row, hit.side);
            return true;
        },
        getSelectedProp: () => {
            pruneSelection();
            return selectedPropId == null ? null : registry().getLive(selectedPropId);
        },
        pruneSelection,
        spawnAt,
        spawnAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return spawnAt(origin.x, origin.y);
        },
        deleteProp(prop) {
            if (!prop) return;
            removePropFromSelection(prop.id);
            forgetPropPlacement(prop.id);
            removeProp(prop);
            notifyUi();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        deleteSelectedProps() {
            const ids = [...selectedPropIds];
            for (let i = 0; i < ids.length; i++) {
                forgetPropPlacement(ids[i]);
                removeProp(registry().get(ids[i]));
            }
            selectedPropIds.clear();
            selectedPropId = null;
            notifyUi();
        },
        listPlacedProps() {
            const counts = new Map();
            /** @type {{ id: number, type: string, faction: string, label: string }[]} */
            const placed = [];
            registry().forEachOfKind("worldProp", (prop) => {
                if (prop.isDead) return;
                const typeLabel = formatPropTypeLabel(prop.type);
                const index = (counts.get(prop.type) ?? 0) + 1;
                counts.set(prop.type, index);
                placed.push({ id: prop.id, type: prop.type, faction: resolveSandboxFaction(prop), label: `${typeLabel} #${index}` });
            });
            return placed;
        },
        listPlacedFloorBelts() {
            const grid = state.obstacleGrid;
            const counts = new Map();
            /** @type {{ col: number, row: number, kind: number, facingIndex: number, label: string }[]} */
            const placed = [];
            const size = grid.cols * grid.rows;
            for (let idx = 0; idx < size; idx++) {
                if (!grid.floorStore.isBeltKindAtIdx(idx)) continue;
                const kind = grid.floorStore.kind[idx];
                const col = idx % grid.cols;
                const row = (idx / grid.cols) | 0;
                const index = (counts.get(kind) ?? 0) + 1;
                counts.set(kind, index);
                const facingLabel = formatFloorBeltFacingLabel(grid.floorStore.facing[idx]);
                placed.push({ col, row, kind, facingIndex: grid.floorStore.facing[idx], label: `${formatFloorBeltKindLabel(kind)} #${index} · ${facingLabel}` });
            }
            return placed;
        },
        stampPassagePowerSourceAtWorld(worldX, worldY, defaultPowered = false) {
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, defaultPowered)) return false;
            touchFloorPlacement(col, row);
            setSelectedFloorCell(col, row);
            notifyUi();
            return true;
        },
        listPlacedPassagePowerSources() {
            const grid = state.obstacleGrid;
            /** @type {{ col: number, row: number, defaultPowered: boolean, label: string }[]} */
            const placed = [];
            let index = 0;
            const size = grid.cols * grid.rows;
            for (let idx = 0; idx < size; idx++) {
                if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) continue;
                index++;
                const col = idx % grid.cols;
                const row = (idx / grid.cols) | 0;
                const defaultPowered = grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx);
                placed.push({ col, row, defaultPowered, label: `Power source #${index}${defaultPowered ? " · default on" : ""}` });
            }
            return placed;
        },
        getSelectedRoomNodeId: () => selectedRoomNodeId,
        getSelectedRoomLinkId: () => selectedRoomLinkId,
        getSelectedRoomLinkCorridorIndex: () => selectedRoomLinkCorridorIndex,
        getSelectedRoomNode: () => (selectedRoomNodeId == null ? null : (getRoomNode(state, selectedRoomNodeId) ?? null)),
        getSelectedRoomLink: () => (selectedRoomLinkId == null ? null : (getRoomLink(state, selectedRoomLinkId) ?? null)),
        getSelectedRoomNodeInfo() {
            const node = this.getSelectedRoomNode();
            if (!node) return null;
            return { ...node, label: formatRoomNodeLabel(node) };
        },
        getSelectedRoomLinkInfo() {
            const link = this.getSelectedRoomLink();
            if (!link) return null;
            const nodeA = getRoomNode(state, link.a);
            const nodeB = getRoomNode(state, link.b);
            const limits = nodeA && nodeB ? linkCorridorLimits(nodeA, nodeB) : null;
            const roll = nodeA && nodeB ? resolveLinkCorridorRoll(link, nodeA, nodeB, createSeededRng(link.seed ?? link.id * 9973)) : null;
            return {
                ...link,
                corridorType: normalizeCorridorType(link.corridorType),
                label: formatRoomLinkCorridorLabel(link, selectedRoomLinkCorridorIndex),
                corridorIndex: selectedRoomLinkCorridorIndex,
                maxCorridorWidth: limits?.maxWidth ?? null,
                maxCorridorCount: MAX_CORRIDOR_COUNT,
                rolledCorridorCount: roll?.corridorCount ?? null,
                rolledCorridorWidths: roll?.corridorWidths ?? null,
            };
        },
        setSelectedRoomNodeId(id) {
            setSelectedRoomNodeId(id);
        },
        setSelectedRoomLinkId(id, corridorIndex) {
            setSelectedRoomLinkId(id, corridorIndex);
        },
        pickRoomNodeAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            const node = pickRoomNodeAt(state, col, row);
            if (!node) return false;
            setSelectedRoomNodeId(node.id);
            return true;
        },
        addRoomLinkBetweenNodes(a, b, options = {}) {
            const link = addRoomLink(state, a, b, options);
            if (!link) return null;
            touchRoomLinkCorridors(link);
            syncRoomGraphBake(state);
            notifyUi();
            return link;
        },
        removeRoomLinkById(linkId) {
            if (!removeRoomLink(state, linkId)) return false;
            forgetRoomLinkPlacement(linkId);
            if (selectedRoomLinkId === linkId) selectedRoomLinkId = null;
            syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        clearSelectedRoomNodeLinks() {
            const node = this.getSelectedRoomNode();
            if (!node) return;
            const links = listRoomLinks(state).filter((link) => link.a === node.id || link.b === node.id);
            clearRoomLinksForNode(state, node.id);
            for (let i = 0; i < links.length; i++) forgetRoomLinkPlacement(links[i].id);
            if (selectedRoomLinkId != null && !getRoomLink(state, selectedRoomLinkId)) dropRoomGraphSelection();
            syncRoomGraphBake(state);
            notifyUi();
        },
        listSelectedRoomNodeLinks() {
            const node = this.getSelectedRoomNode();
            if (!node) return [];
            return listRoomNodeCorridorEntries(state, node.id).map((entry) => ({ linkId: entry.link.id, corridorIndex: entry.corridorIndex, label: entry.label }));
        },
        deleteSelectedRoomNode() {
            if (selectedRoomNodeId == null) return;
            const links = listRoomLinks(state).filter((link) => link.a === selectedRoomNodeId || link.b === selectedRoomNodeId);
            removeRoomNode(state, selectedRoomNodeId);
            forgetRoomNodePlacement(selectedRoomNodeId);
            for (let i = 0; i < links.length; i++) forgetRoomLinkPlacement(links[i].id);
            dropRoomGraphSelection();
            syncRoomGraphBake(state);
            notifyUi();
        },
        deleteSelectedRoomLink() {
            if (selectedRoomLinkId == null) return;
            forgetRoomLinkPlacement(selectedRoomLinkId);
            removeRoomLink(state, selectedRoomLinkId);
            selectedRoomLinkId = null;
            syncRoomGraphBake(state);
            notifyUi();
        },
        updateSelectedRoomLink(patch) {
            if (selectedRoomLinkId == null) return false;
            if (!updateRoomLink(state, selectedRoomLinkId, patch)) return false;
            const link = getRoomLink(state, selectedRoomLinkId);
            if (link) {
                selectedRoomLinkCorridorIndex = Math.min(selectedRoomLinkCorridorIndex, roomLinkCorridorLaneCount(link) - 1);
                if (patch.corridorCount != null) touchRoomLinkCorridors(link);
            }
            const deferBake = patch.corridorCount == null && patch.corridorWidthMin == null && patch.corridorWidthMax == null;
            if (deferBake) syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        rerollSelectedRoomLink() {
            if (selectedRoomLinkId == null) return;
            rerollRoomLinkBake(state, selectedRoomLinkId);
            notifyUi();
        },
        listPlacedRoomNodes() {
            return listRoomNodes(state).map((node) => ({ id: node.id, col: node.col, row: node.row, width: node.width, height: node.height, label: formatRoomNodeLabel(node) }));
        },
        listPlacedRoomLinks() {
            return listRoomLinkCorridorSceneEntries(state);
        },
        seedPlacementOrderFromState() {
            resetPlacementOrder();
            const props = this.listPlacedProps().sort((a, b) => a.id - b.id);
            for (let i = 0; i < props.length; i++) touchPropPlacement(props[i].id);
            for (const entry of this.listPlacedFloorBelts()) touchFloorPlacement(entry.col, entry.row);
            for (const entry of this.listPlacedPassagePowerSources()) touchFloorPlacement(entry.col, entry.row);
            for (const entry of this.listPlacedVoxelWalls()) touchVoxelPlacement(entry.col, entry.row);
            for (const entry of this.listPlacedRailWalls()) touchEdgePlacement("rail", entry.col, entry.row, entry.side);
            for (const entry of this.listPlacedForcefields()) touchEdgePlacement("forcefield", entry.col, entry.row, entry.side);
            for (const entry of this.listPlacedRoomNodes()) touchRoomNodePlacement(entry.id);
            for (const entry of this.listPlacedRoomLinks()) touchRoomLinkPlacement(entry.linkId, entry.corridorIndex);
        },
        listPlacedSceneItems() {
            /** @type {{ seq: number, kind: string, label: string, propId?: number, propType?: string, col?: number, row?: number, side?: number }[]} */
            const items = [];
            for (const entry of this.listPlacedProps())
                items.push({
                    seq: placementSeq(propPlacementKey(entry.id), entry.id),
                    kind: "prop",
                    label: `${entry.label} · ${formatSandboxFactionLabel(entry.faction)}`,
                    propId: entry.id,
                    propType: entry.type,
                });
            for (const entry of this.listPlacedFloorBelts())
                items.push({ seq: placementSeq(floorPlacementKey(entry.col, entry.row), 1e9 + entry.col + entry.row * 1e6), kind: "floorBelt", label: entry.label, col: entry.col, row: entry.row });
            for (const entry of this.listPlacedPassagePowerSources())
                items.push({ seq: placementSeq(floorPlacementKey(entry.col, entry.row), 2e9 + entry.col + entry.row * 1e6), kind: "powerSource", label: entry.label, col: entry.col, row: entry.row });
            for (const entry of listTrackedVoxelWalls())
                items.push({ seq: placementSeq(voxelPlacementKey(entry.col, entry.row), 3e9 + entry.col + entry.row * 1e6), kind: "voxel", label: entry.label, col: entry.col, row: entry.row });
            for (const entry of listTrackedRailWalls())
                items.push({
                    seq: placementSeq(edgePlacementKey("rail", entry.col, entry.row, entry.side), 4e9 + entry.col + entry.row * 1e6 + entry.side),
                    kind: "rail",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                    side: entry.side,
                });
            for (const entry of this.listPlacedForcefields())
                items.push({
                    seq: placementSeq(edgePlacementKey("forcefield", entry.col, entry.row, entry.side), 5e9 + entry.col + entry.row * 1e6 + entry.side),
                    kind: "forcefield",
                    label: entry.label,
                    col: entry.col,
                    row: entry.row,
                    side: entry.side,
                });
            for (const entry of this.listPlacedRoomNodes())
                items.push({ seq: placementSeq(roomNodePlacementKey(entry.id), 7e9 + entry.id), kind: "roomNode", label: entry.label, roomNodeId: entry.id });
            for (const entry of this.listPlacedRoomLinks())
                items.push({
                    seq: placementSeq(roomLinkPlacementKey(entry.linkId, entry.corridorIndex), 8e9 + entry.linkId + entry.corridorIndex * 1e6),
                    kind: "roomLink",
                    label: entry.label,
                    roomLinkId: entry.linkId,
                    corridorIndex: entry.corridorIndex,
                });
            items.sort((a, b) => a.seq - b.seq);
            return items;
        },
        isSceneItemSelected(item) {
            if (item.kind === "prop") return selectedPropIds.has(item.propId);
            if (item.kind === "roomNode") return selectedRoomNodeId === item.roomNodeId;
            if (item.kind === "roomLink") return selectedRoomLinkId === item.roomLinkId && selectedRoomLinkCorridorIndex === item.corridorIndex;
            if (item.kind === "floorBelt" || item.kind === "powerSource") return selectedFloorCell?.col === item.col && selectedFloorCell.row === item.row;
            if (item.kind === "voxel") return selectedVoxelCell?.col === item.col && selectedVoxelCell.row === item.row;
            return selectedRailEdge?.col === item.col && selectedRailEdge.row === item.row && selectedRailEdge.side === item.side;
        },
        selectSceneItem(item) {
            if (item.kind === "prop") {
                this.setPlacePaletteKey(`prop:${item.propType}`);
                setSinglePropSelection(item.propId);
                return;
            }
            if (item.kind === "roomNode") {
                setSelectedRoomNodeId(item.roomNodeId);
                return;
            }
            if (item.kind === "roomLink") {
                setSelectedRoomLinkFromScene(item.roomLinkId, item.corridorIndex ?? 0);
                return;
            }
            if (item.kind === "floorBelt" || item.kind === "powerSource") {
                setSelectedFloorCell(item.col, item.row);
                return;
            }
            if (item.kind === "voxel") {
                this.setPlacePaletteKey("wall:voxel");
                setSelectedVoxelCell(item.col, item.row);
                return;
            }
            const wallKey = item.kind === "rail" ? "rail" : "forcefield";
            this.setPlacePaletteKey(`wall:${wallKey}`);
            setSelectedRailEdge(item.col, item.row, item.side);
        },
        deleteSceneItem(item) {
            if (item.kind === "prop") {
                this.deletePropById(item.propId);
                return;
            }
            if (item.kind === "roomNode") {
                setSelectedRoomNodeId(item.roomNodeId);
                this.deleteSelectedRoomNode();
                return;
            }
            if (item.kind === "roomLink") {
                setSelectedRoomLinkId(item.roomLinkId, item.corridorIndex ?? 0);
                this.deleteSelectedRoomLink();
                return;
            }
            if (item.kind === "floorBelt" || item.kind === "powerSource") {
                setSelectedFloorCell(item.col, item.row);
                this.deleteSelectedFloorCell();
                return;
            }
            if (item.kind === "voxel") {
                setSelectedVoxelCell(item.col, item.row);
                this.deleteSelectedWall();
                return;
            }
            setSelectedRailEdge(item.col, item.row, item.side);
            this.deleteSelectedWall();
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
            state.obstacleGrid.clearAllFloorCells();
            unbakeRoomGraph(state);
            clearRoomGraph(state);
            selectedPropIds.clear();
            selectedPropId = null;
            dropFloorSelection();
            dropWallSelection();
            dropRoomGraphSelection();
            resetPlacementOrder();
            notifyUi();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync: notifyUi,
        getState: () => state,
    };
}
