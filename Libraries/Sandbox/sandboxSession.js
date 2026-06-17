import { getPropAsset, formatPropTypeLabel } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction, formatSandboxFactionLabel } from "../Combat/sandboxTargeting.js";
import { getSandboxEntityMeta } from "../../GameState/sandboxEntityMeta.js";
import { removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import {
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isRoomNodeSpawnAsset,
    isRoomLinkSpawnAsset,
    isPuzzleTemplateSpawnAsset,
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
    updateRoomLink,
    updateRoomNode,
    syncRoomGraphBake,
    unbakeRoomGraph,
    rerollRoomLinkBake,
    expandGridForRoomNodeFootprint,
} from "../RoomGraph/index.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS, stampBeltCratePuzzleAt } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { linkCorridorLimits, MAX_CORRIDOR_COUNT, resolveLinkCorridorRoll } from "../RoomGraph/roomGraphLinkCorridor.js";
import { resolveRailWallThicknessLevel } from "../RoomGraph/roomGraphClosedRooms.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { invalidateRoomLinkFloorSurface, invalidateRoomNodeFloorSurface, normalizeAuthoredSurfaceProfileId } from "../RoomGraph/roomGraphSurfaceProfile.js";
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
import { createSandboxSelection } from "./sandboxSelection.js";
/** @param {object} state */
export function createSandboxSession(state) {
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    /** @type {string} prop:id or wall:voxel|rail|forcefield */
    let placePaletteKey = "";
    /** @type {'voxel' | 'rail' | 'forcefield'} */
    let wallStampMode = "voxel";
    let wallHeightLevel = 1;
    let railThicknessLevel = 4;
    let forcefieldStampMode = PASSAGE_MODE.Solid;
    let spawnRoomNodeCols = DEFAULT_ROOM_NODE_COLS;
    let spawnRoomNodeRows = DEFAULT_ROOM_NODE_ROWS;
    let spawnPuzzleAreaCols = BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS;
    let spawnPuzzleAreaRows = BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS;
    let spawnCorridorType = CORRIDOR_TYPE_EMPTY;
    let spawnCorridorWidth = 1;
    let spawnRoomNodeSurfaceProfileId = null;
    let spawnCorridorSurfaceProfileId = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    let nextPlacementSeq = 1;
    /** @type {Map<string, number>} */
    const placementSeqByKey = new Map();
    const spawnPropIdFromPalette = () => (placePaletteKey.startsWith("prop:") ? placePaletteKey.slice(5) : "");
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
    const clampAuthoredRailWallHeight = (level) => {
        const max = state.worldSurfaces.settings.maxWallHeightLevel;
        return Math.min(max, Math.max(1, Math.round(level)));
    };
    const clampAuthoredRailWallThickness = (level) => resolveRailWallThicknessLevel(level);
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
    const selection = createSandboxSelection({
        isLiveProp: (id) => !!registry().getLive(id),
        getRoomLink: (linkId) => getRoomLink(state, linkId),
    });
    const pickSelection = (input) => {
        selection.select(input);
        notifyUi();
    };
    const clearSelection = () => {
        selection.clearSelection();
        notifyUi();
    };
    const clearPlaceMode = () => {
        if (placePaletteKey === "") return;
        placePaletteKey = "";
        notifyUi();
    };
    const removeProp = (prop) => removeSandboxWorldProp(state, prop);
    const pruneSelection = () => {
        if (!selection.prunePropSelection()) return;
        notifyUi();
    };
    /** @returns {boolean} */
    const spawnAt = (worldX, worldY) => {
        const spawnPropId = spawnPropIdFromPalette();
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
            pickSelection({ kind: "floor", col, row });
            return true;
        }
        if (isGridPassagePowerSourceSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, false)) return false;
            touchFloorPlacement(col, row);
            pickSelection({ kind: "floor", col, row });
            return true;
        }
        if (isRoomNodeSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            expandGridForRoomNodeFootprint(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows);
            const node = stampRoomNodeAt(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows, undefined, spawnRoomNodeSurfaceProfileId);
            if (!node) return false;
            touchRoomNodePlacement(node.id);
            pickSelection({ kind: "roomNode", id: node.id });
            syncRoomGraphBake(state);
            notifyUi();
            return true;
        }
        if (isPuzzleTemplateSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            const stamped = stampBeltCratePuzzleAt(state, col, row, spawnPuzzleAreaCols, spawnPuzzleAreaRows);
            if (!stamped) return false;
            touchRoomNodePlacement(stamped.roomA.id);
            touchRoomNodePlacement(stamped.roomB.id);
            touchRoomNodePlacement(stamped.roomC.id);
            for (let i = 0; i < stamped.links.length; i++) touchRoomLinkCorridors(stamped.links[i]);
            pickSelection({ kind: "roomNode", id: stamped.roomA.id });
            notifyUi();
            return true;
        }
        if (isRoomLinkSpawnAsset(asset)) return false;
        const spawned = spawnPlacedSandboxProp(state, worldX, worldY, spawnPropId, spawnFaction);
        if (spawned) {
            touchPropPlacement(spawned.id);
            pickSelection({ kind: "prop", ids: [spawned.id] });
        }
        return spawned != null;
    };
    return {
        getSpawnPropId: spawnPropIdFromPalette,
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
        getSpawnPuzzleAreaCols: () => spawnPuzzleAreaCols,
        setSpawnPuzzleAreaCols: (cols) => {
            spawnPuzzleAreaCols = Math.max(1, Math.min(96, Math.round(cols)));
            notifyUi();
        },
        getSpawnPuzzleAreaRows: () => spawnPuzzleAreaRows,
        setSpawnPuzzleAreaRows: (rows) => {
            spawnPuzzleAreaRows = Math.max(1, Math.min(96, Math.round(rows)));
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
        getSpawnRoomNodeSurfaceProfileId: () => spawnRoomNodeSurfaceProfileId,
        setSpawnRoomNodeSurfaceProfileId: (profileId) => {
            spawnRoomNodeSurfaceProfileId = normalizeAuthoredSurfaceProfileId(profileId);
            notifyUi();
        },
        getSpawnCorridorSurfaceProfileId: () => spawnCorridorSurfaceProfileId,
        setSpawnCorridorSurfaceProfileId: (profileId) => {
            spawnCorridorSurfaceProfileId = normalizeAuthoredSurfaceProfileId(profileId);
            notifyUi();
        },
        getSelectedPropId: () => selection.getSelectedPropId(),
        getSelectedPropIds: () => {
            pruneSelection();
            return selection.getSelectedPropIds();
        },
        getSelection: () => selection.getSelection(),
        select: pickSelection,
        setSelectedPropId: (id) => {
            pickSelection(id == null ? null : { kind: "prop", ids: [id] });
        },
        setSelectedPropIds: (ids) => {
            pickSelection({ kind: "prop", ids });
        },
        clearPropSelection: () => {
            selection.clearPropSelection();
            notifyUi();
        },
        clearSelection,
        clearPlaceMode,
        clearRoomGraphSelection: () => {
            selection.clearRoomGraphSelection();
            notifyUi();
        },
        getSelectedFloorCell: () => selection.getSelectedFloorCell(),
        setSelectedFloorCell: (col, row) => {
            pickSelection({ kind: "floor", col, row });
        },
        clearFloorSelection: () => {
            selection.clearFloorSelection();
            notifyUi();
        },
        rotateSelectedFloorBelt(steps = 1) {
            const selectedFloorCell = selection.getSelectedFloorCell();
            if (!selectedFloorCell) return false;
            const { col, row } = selectedFloorCell;
            const idx = col + row * state.obstacleGrid.cols;
            if (!state.obstacleGrid.floorStore.isBeltKindAtIdx(idx)) {
                selection.clearFloorSelection();
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
            pickSelection({ kind: "floor", col: occupant.col, row: occupant.row });
            return true;
        },
        moveSelectedFloorBeltTo(targetCol, targetRow) {
            const selectedFloorCell = selection.getSelectedFloorCell();
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (col === targetCol && row === targetRow) return true;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                selection.clearFloorSelection();
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
            pickSelection({ kind: "floor", col: targetCol, row: targetRow });
            markGridZoneSubscriptionsDirty(state);
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            const selectedFloorCell = selection.getSelectedFloorCell();
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                selection.clearFloorSelection();
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
            const selectedFloorCell = selection.getSelectedFloorCell();
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) {
                if (!clearPassagePowerSourceAt(state, col, row)) return false;
            } else if (!grid.clearFloorCell(col, row)) return false;
            else markGridZoneSubscriptionsDirty(state);
            forgetFloorPlacement(col, row);
            selection.clearFloorSelection();
            notifyUi();
            return true;
        },
        getSelectedFloorBeltInfo() {
            const selectedFloorCell = selection.getSelectedFloorCell();
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
            const selectedFloorCell = selection.getSelectedFloorCell();
            if (!selectedFloorCell) return null;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (!cellInRect(col, row, grid.cols, grid.rows)) return null;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isPassagePowerSourceAtIdx(idx)) return null;
            return { col, row, defaultPowered: grid.floorStore.passagePowerSourceDefaultPoweredAtIdx(idx) };
        },
        setSelectedPassagePowerSourceDefaultPowered(powered) {
            const selectedFloorCell = selection.getSelectedFloorCell();
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
            if (key.startsWith("wall:")) wallStampMode = /** @type {'voxel' | 'rail' | 'forcefield'} */ (key.slice(5));
            selection.clearPalettePlaceSelection(key);
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
        getSelectedVoxelCell: () => selection.getSelectedVoxelCell(),
        getSelectedRailEdge: () => selection.getSelectedRailEdge(),
        setSelectedVoxelCell: (col, row) => {
            pickSelection({ kind: "voxel", col, row });
        },
        setSelectedRailEdge: (col, row, side) => {
            pickSelection({ kind: "rail", col, row, side });
        },
        clearWallSelection: () => {
            selection.clearWallSelection();
            notifyUi();
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        listPlacedForcefields: () => listPlacedForcefields(state.obstacleGrid),
        getSelectedVoxelWallInfo: () => {
            const selectedVoxelCell = selection.getSelectedVoxelCell();
            return selectedVoxelCell ? getVoxelWallInfo(state.obstacleGrid, selectedVoxelCell.col, selectedVoxelCell.row) : null;
        },
        getSelectedRailWallInfo: () => {
            const selectedRailEdge = selection.getSelectedRailEdge();
            return selectedRailEdge && railWallEdgeAt(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getRailWallInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null;
        },
        getSelectedForcefieldInfo: () => {
            const selectedRailEdge = selection.getSelectedRailEdge();
            return selectedRailEdge && forcefieldEdgeAt(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getForcefieldInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null;
        },
        setSelectedForcefieldMode(mode) {
            const selectedRailEdge = selection.getSelectedRailEdge();
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
            const selectedRailEdge = selection.getSelectedRailEdge();
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
                    pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                    return true;
                }
                if (!stampForcefieldAt(state, hit.col, hit.row, hit.side, { mode: forcefieldStampMode, allowedSide: hit.side })) return false;
                touchEdgePlacement("forcefield", hit.col, hit.row, hit.side);
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (railWallEdgeAt(state.obstacleGrid, hit.col, hit.row, hit.side)) {
                    pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                    return true;
                }
                if (!stampRailWallAt(state, hit.col, hit.row, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                touchEdgePlacement("rail", hit.col, hit.row, hit.side);
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            if (cellIsStaticWall(state.obstacleGrid, col, row)) {
                pickSelection({ kind: "voxel", col, row });
                return true;
            }
            if (!stampVoxelWallAt(state, col, row, wallHeightLevel)) return false;
            touchVoxelPlacement(col, row);
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        stampWallAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.stampWallAtWorld(origin.x, origin.y);
        },
        setSelectedVoxelWallHeight(heightLevel) {
            const selectedVoxelCell = selection.getSelectedVoxelCell();
            if (!selectedVoxelCell) return false;
            const { col, row } = selectedVoxelCell;
            if (!setVoxelWallHeightAt(state, col, row, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            const selectedRailEdge = selection.getSelectedRailEdge();
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            if (!stampRailWallAt(state, col, row, side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            const selectedRailEdge = selection.getSelectedRailEdge();
            if (!selectedRailEdge) return false;
            const grid = state.obstacleGrid;
            const { col, row, side } = selectedRailEdge;
            const info = getRailWallInfo(grid, col, row, side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, col, row, newSide)) return false;
            if (!clearRailWallAt(state, col, row, side)) return false;
            if (!stampRailWallAt(state, col, row, newSide, info.heightLevel, info.thicknessLevel)) return false;
            pickSelection({ kind: "rail", col, row, side: newSide });
            return true;
        },
        deleteSelectedWall() {
            const selectedVoxelCell = selection.getSelectedVoxelCell();
            if (selectedVoxelCell) {
                const { col, row } = selectedVoxelCell;
                if (!clearVoxelWallAt(state, col, row)) return false;
                forgetVoxelPlacement(col, row);
                selection.clearWallSelection();
                notifyUi();
                return true;
            }
            const selectedRailEdge = selection.getSelectedRailEdge();
            if (selectedRailEdge) {
                const { col, row, side } = selectedRailEdge;
                const grid = state.obstacleGrid;
                if (forcefieldEdgeAt(grid, col, row, side)) {
                    if (!clearForcefieldAt(state, col, row, side)) return false;
                    forgetEdgePlacement("forcefield", col, row, side);
                } else if (!clearRailWallAt(state, col, row, side)) return false;
                else forgetEdgePlacement("rail", col, row, side);
                selection.clearWallSelection();
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
                selection.dropDeletedWallSelection(hit.col, hit.row, hit.side);
                notifyUi();
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!clearVoxelWallAt(state, col, row)) return false;
            forgetVoxelPlacement(col, row);
            selection.dropDeletedWallSelection(col, row);
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
                    pickSelection({ kind: "rail", col, row, side });
                    return true;
                }
                if (railWallEdgeAt(grid, col, row, side)) {
                    placePaletteKey = "wall:rail";
                    wallStampMode = "rail";
                    pickSelection({ kind: "rail", col, row, side });
                    return true;
                }
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!cellIsStaticWall(grid, col, row)) return false;
            placePaletteKey = "wall:voxel";
            wallStampMode = "voxel";
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !railWallEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!cellIsStaticWall(grid, col, row)) return false;
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        /** Pick a stamped forcefield edge from the map (Props tab or any panel). */
        pickForcefieldAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (!hit || !forcefieldEdgeAt(grid, hit.col, hit.row, hit.side)) return false;
            pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
            return true;
        },
        getSelectedProp: () => {
            pruneSelection();
            const selectedPropId = selection.getSelectedPropId();
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
            selection.removePropFromSelection(prop.id);
            forgetPropPlacement(prop.id);
            removeProp(prop);
            notifyUi();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        deleteSelectedProps() {
            const ids = selection.getSelectedPropIds();
            for (let i = 0; i < ids.length; i++) {
                forgetPropPlacement(ids[i]);
                removeProp(registry().get(ids[i]));
            }
            selection.clearDeletedPropSelection();
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
            pickSelection({ kind: "floor", col, row });
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
        getSelectedRoomNodeId: () => selection.getSelectedRoomNodeId(),
        getSelectedRoomLinkId: () => selection.getSelectedRoomLinkId(),
        getSelectedRoomLinkCorridorIndex: () => selection.getSelectedRoomLinkCorridorIndex(),
        getSelectedRoomNode: () => {
            const selectedRoomNodeId = selection.getSelectedRoomNodeId();
            return selectedRoomNodeId == null ? null : (getRoomNode(state, selectedRoomNodeId) ?? null);
        },
        getSelectedRoomLink: () => {
            const selectedRoomLinkId = selection.getSelectedRoomLinkId();
            return selectedRoomLinkId == null ? null : (getRoomLink(state, selectedRoomLinkId) ?? null);
        },
        getSelectedRoomNodeInfo() {
            const node = this.getSelectedRoomNode();
            if (!node) return null;
            return { ...node, label: formatRoomNodeLabel(node) };
        },
        getSelectedRoomLinkInfo() {
            const link = this.getSelectedRoomLink();
            if (!link) return null;
            const selectedRoomLinkCorridorIndex = selection.getSelectedRoomLinkCorridorIndex();
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
            pickSelection({ kind: "roomNode", id });
        },
        setSelectedRoomLinkId(id, corridorIndex) {
            pickSelection({ kind: "roomLink", linkId: id, corridorIndex });
        },
        pickRoomNodeAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            const node = pickRoomNodeAt(state, col, row);
            if (!node) return false;
            pickSelection({ kind: "roomNode", id: node.id });
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
            selection.dropDeletedRoomLinkSelection(linkId);
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
            selection.dropRoomGraphIfLinkMissing((id) => !!getRoomLink(state, id));
            syncRoomGraphBake(state);
            notifyUi();
        },
        listSelectedRoomNodeLinks() {
            const node = this.getSelectedRoomNode();
            if (!node) return [];
            return listRoomNodeCorridorEntries(state, node.id).map((entry) => ({ linkId: entry.link.id, corridorIndex: entry.corridorIndex, label: entry.label }));
        },
        deleteSelectedRoomNode() {
            const selectedRoomNodeId = selection.getSelectedRoomNodeId();
            if (selectedRoomNodeId == null) return;
            const links = listRoomLinks(state).filter((link) => link.a === selectedRoomNodeId || link.b === selectedRoomNodeId);
            removeRoomNode(state, selectedRoomNodeId);
            forgetRoomNodePlacement(selectedRoomNodeId);
            for (let i = 0; i < links.length; i++) forgetRoomLinkPlacement(links[i].id);
            selection.clearRoomGraphSelection();
            syncRoomGraphBake(state);
            notifyUi();
        },
        deleteSelectedRoomLink() {
            const selectedRoomLinkId = selection.getSelectedRoomLinkId();
            if (selectedRoomLinkId == null) return;
            forgetRoomLinkPlacement(selectedRoomLinkId);
            removeRoomLink(state, selectedRoomLinkId);
            selection.clearRoomLinkAfterDelete();
            syncRoomGraphBake(state);
            notifyUi();
        },
        updateSelectedRoomLink(patch) {
            const selectedRoomLinkId = selection.getSelectedRoomLinkId();
            if (selectedRoomLinkId == null) return false;
            if (patch.railWallHeightLevel != null) patch = { ...patch, railWallHeightLevel: clampAuthoredRailWallHeight(patch.railWallHeightLevel) };
            if (patch.railWallThicknessLevel != null) patch = { ...patch, railWallThicknessLevel: clampAuthoredRailWallThickness(patch.railWallThicknessLevel) };
            if (!updateRoomLink(state, selectedRoomLinkId, patch)) return false;
            const link = getRoomLink(state, selectedRoomLinkId);
            if (link) {
                selection.clampRoomLinkCorridorIndex(roomLinkCorridorLaneCount(link));
                if (patch.corridorCount != null) touchRoomLinkCorridors(link);
            }
            const needsReroll = patch.corridorCount != null || patch.corridorWidthMin != null || patch.corridorWidthMax != null;
            const profileOnly =
                patch.surfaceProfileId !== undefined && !needsReroll && patch.corridorType == null && patch.railWallHeightLevel == null && patch.railWallThicknessLevel == null && patch.seed == null;
            if (!needsReroll && !profileOnly) syncRoomGraphBake(state);
            if (profileOnly) invalidateRoomLinkFloorSurface(state, selectedRoomLinkId);
            notifyUi();
            return true;
        },
        updateSelectedRoomNode(patch) {
            const selectedRoomNodeId = selection.getSelectedRoomNodeId();
            if (selectedRoomNodeId == null) return false;
            if (patch.railWallHeightLevel != null) patch = { ...patch, railWallHeightLevel: clampAuthoredRailWallHeight(patch.railWallHeightLevel) };
            if (patch.railWallThicknessLevel != null) patch = { ...patch, railWallThicknessLevel: clampAuthoredRailWallThickness(patch.railWallThicknessLevel) };
            if (!updateRoomNode(state, selectedRoomNodeId, patch)) return false;
            const profileOnly = patch.surfaceProfileId !== undefined && patch.railWallHeightLevel == null && patch.railWallThicknessLevel == null;
            if (profileOnly) invalidateRoomNodeFloorSurface(state, getRoomNode(state, selectedRoomNodeId));
            else syncRoomGraphBake(state);
            notifyUi();
            return true;
        },
        rerollSelectedRoomLink() {
            const selectedRoomLinkId = selection.getSelectedRoomLinkId();
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
            return selection.matchesSceneItem(item);
        },
        selectSceneItem(item) {
            if (item.kind === "prop") {
                this.setPlacePaletteKey(`prop:${item.propType}`);
                pickSelection({ kind: "prop", ids: [item.propId] });
                return;
            }
            if (item.kind === "roomNode") {
                pickSelection({ kind: "roomNode", id: item.roomNodeId });
                return;
            }
            if (item.kind === "roomLink") {
                pickSelection({ kind: "roomLink", linkId: item.roomLinkId, corridorIndex: item.corridorIndex ?? 0, nodeId: null });
                return;
            }
            if (item.kind === "floorBelt" || item.kind === "powerSource") {
                pickSelection({ kind: "floor", col: item.col, row: item.row });
                return;
            }
            if (item.kind === "voxel") {
                this.setPlacePaletteKey("wall:voxel");
                pickSelection({ kind: "voxel", col: item.col, row: item.row });
                return;
            }
            const wallKey = item.kind === "rail" ? "rail" : "forcefield";
            this.setPlacePaletteKey(`wall:${wallKey}`);
            pickSelection({ kind: "rail", col: item.col, row: item.row, side: item.side });
        },
        deleteSceneItem(item) {
            if (item.kind === "prop") {
                this.deletePropById(item.propId);
                return;
            }
            if (item.kind === "roomNode") {
                pickSelection({ kind: "roomNode", id: item.roomNodeId });
                this.deleteSelectedRoomNode();
                return;
            }
            if (item.kind === "roomLink") {
                pickSelection({ kind: "roomLink", linkId: item.roomLinkId, corridorIndex: item.corridorIndex ?? 0 });
                this.deleteSelectedRoomLink();
                return;
            }
            if (item.kind === "floorBelt" || item.kind === "powerSource") {
                pickSelection({ kind: "floor", col: item.col, row: item.row });
                this.deleteSelectedFloorCell();
                return;
            }
            if (item.kind === "voxel") {
                pickSelection({ kind: "voxel", col: item.col, row: item.row });
                this.deleteSelectedWall();
                return;
            }
            pickSelection({ kind: "rail", col: item.col, row: item.row, side: item.side });
            this.deleteSelectedWall();
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
            state.obstacleGrid.clearAllFloorCells();
            unbakeRoomGraph(state);
            clearRoomGraph(state);
            selection.clearSelection();
            resetPlacementOrder();
            notifyUi();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync: notifyUi,
    };
}
