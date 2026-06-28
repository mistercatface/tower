import { formatPropTypeLabel } from "../Props/PropCatalog.js";
import { visitLiveWorldProps } from "../../GameState/EntityRegistry.js";
import { sandboxAssetMatchesTagFilter } from "./sandboxCapabilities.js";
import { resolveSandboxFaction } from "./sandboxFaction.js";
import { removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { getRoomLink, clearRoomGraph, unbakeRoomGraph } from "../RoomGraph/index.js";
import { resolveRailWallThicknessLevel } from "../RoomGraph/roomGraphClosedRooms.js";
import { canStampFloorBeltAt, clearPassagePowerSourceAt, GRID_ROTATABLE_OCCUPANT, pickRotatableGridOccupantAtWorld, rotateGridOccupantAt, stampPassagePowerSourceAt } from "./floorOccupancy.js";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitGridNavEdit } from "./gridNavEdit.js";
import { cellBoundsAt, unionCellBounds } from "../DataStructures/CellRect.js";
import { syncPassagePowerNetwork } from "./passagePowerNetwork.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import propCatalog from "../../Assets/props/index.js";
import {
    clearForcefieldAt,
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    getForcefieldInfo,
    getRailWallInfo,
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
import { cellIsStaticWall, forcefieldEdgeAt, railWallEdgeAt } from "../Spatial/grid/gridCellTopology.js";
import { createSandboxSelection } from "./sandboxSelection.js";
import { selectionFloorCell, selectionPrimaryPropId, selectionPropIds, selectionRailEdge, selectionVoxelCell } from "./sandboxSelectionInspectors.js";
import { createSandboxPlacementOrder } from "./sandboxPlacementOrder.js";
import { createSandboxSpawnSession } from "./sandboxSpawnSession.js";
import { createSandboxRoomGraphSession } from "./sandboxRoomGraphSession.js";
import { buildSelectionInspector, removeSceneItem } from "./sandboxScenePlaceables.js";
/** @param {object} state */
export function createSandboxSession(state) {
    let placePaletteKey = "";
    let wallStampMode = "voxel";
    let wallHeightLevel = 1;
    let railThicknessLevel = 4;
    let forcefieldStampMode = PASSAGE_MODE.Solid;
    let selectionTagFilter = "all";
    let uiSync = null;
    function notifyUi() {
        uiSync?.();
    }
    const registry = () => state.entityRegistry;
    const placement = createSandboxPlacementOrder(state);
    const selection = createSandboxSelection({ isLiveProp: (id) => !!registry().getLive(id), getRoomLink: (linkId) => getRoomLink(state, linkId) });
    const pickSelection = (input) => {
        selection.select(input);
        if (input != null) clearPlaceMode();
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
    const pruneSelection = () => {
        if (!selection.prunePropSelection()) return;
        notifyUi();
    };
    const sel = () => selection.getSelection();
    const spawnPropIdFromPalette = () => (placePaletteKey.startsWith("prop:") ? placePaletteKey.slice(5) : "");
    const clampAuthoredRailWallHeight = (level) => {
        const max = state.worldSurfaces.settings.maxWallHeightLevel;
        return Math.min(max, Math.max(1, Math.round(level)));
    };
    const clampAuthoredRailWallThickness = (level) => resolveRailWallThicknessLevel(level);
    const setPlacePaletteKey = (key) => {
        const hadSelection = selection.getSelection() != null;
        const changed = placePaletteKey !== key;
        placePaletteKey = key;
        if (key.startsWith("wall:")) wallStampMode = /** @type {'voxel' | 'rail' | 'forcefield'} */ (key.slice(5));
        selection.clearSelection();
        if (changed || hadSelection) notifyUi();
    };
    const listPlacedProps = () => {
        const counts = new Map();
        const placed = [];
        visitLiveWorldProps(state.worldProps, (prop) => {
            const typeLabel = formatPropTypeLabel(prop.type);
            const index = (counts.get(prop.type) ?? 0) + 1;
            counts.set(prop.type, index);
            placed.push({ id: prop.id, type: prop.type, faction: resolveSandboxFaction(prop), label: `${typeLabel} #${index}` });
        });
        return placed;
    };
    const listPlacedFloorBelts = () => {
        const grid = state.obstacleGrid;
        const counts = new Map();
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
    };
    const listPlacedPassagePowerSources = () => {
        const grid = state.obstacleGrid;
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
    };
    const spawn = createSandboxSpawnSession(state, { getSpawnPropId: spawnPropIdFromPalette, pickSelection, notifyUi, placement });
    const roomGraph = createSandboxRoomGraphSession(state, {
        selection,
        pickSelection,
        notifyUi,
        placement,
        clampAuthoredRailWallHeight,
        clampAuthoredRailWallThickness,
        setPlacePaletteKey,
        listPlacedProps,
        listPlacedFloorBelts,
        listPlacedPassagePowerSources,
    });
    const removeProp = (prop) => removeSandboxWorldProp(state, prop);
    const listSelectedPropEntries = () => {
        pruneSelection();
        const ids = selectionPropIds(sel());
        const entries = [];
        for (let i = 0; i < ids.length; i++) {
            const prop = registry().getLive(ids[i]);
            if (!prop) continue;
            entries.push({ id: prop.id, label: formatPropTypeLabel(prop.type) });
        }
        return entries;
    };
    const selectAllPropsWithTagFilter = (filter) => {
        const ids = [];
        visitLiveWorldProps(state.worldProps, (prop) => {
            if (!sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter)) return;
            ids.push(prop.id);
        });
        pickSelection(ids.length === 0 ? null : { kind: "prop", ids });
    };
    const filterPropSelectionToTag = (filter) => {
        const current = sel();
        if (current?.kind !== "prop") return;
        const ids = [];
        for (const id of current.ids) {
            const prop = registry().getLive(id);
            if (!prop) continue;
            if (!sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter)) continue;
            ids.push(id);
        }
        pickSelection(ids.length === 0 ? null : { kind: "prop", ids });
    };
    return {
        ...spawn,
        getSelection: () => selection.getSelection(),
        select: pickSelection,
        getSelectionInspector: () => buildSelectionInspector(state, selection, (id) => registry().getLive(id), pruneSelection),
        clearSelection,
        clearPlaceMode,
        clearRoomGraphSelection: () => {
            selection.clearRoomGraphSelection();
            notifyUi();
        },
        rotateSelectedFloorBelt(steps = 1) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const { col, row } = floorCell;
            const idx = col + row * state.obstacleGrid.cols;
            if (!state.obstacleGrid.floorStore.isBeltKindAtIdx(idx)) {
                clearSelection();
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
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = floorCell;
            if (col === targetCol && row === targetRow) return true;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                clearSelection();
                return false;
            }
            if (!canStampFloorBeltAt(state, targetCol, targetRow)) return false;
            const kind = grid.floorStore.kind[idx];
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            const targetIdx = targetCol + targetRow * grid.cols;
            grid.clearFloorCell(idx);
            if (!grid.writeFloorCell(targetIdx, kind, facingRadians)) {
                grid.writeFloorCell(idx, kind, facingRadians);
                return false;
            }
            commitGridNavEdit(state, idx);
            commitGridNavEdit(state, targetCol + targetRow * grid.cols);
            pickSelection({ kind: "floor", col: targetCol, row: targetRow });
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = floorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                clearSelection();
                return false;
            }
            if (grid.floorStore.kind[idx] === kind) return true;
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            applyFloorCellEdit(state, idx, kind, facingRadians);
            notifyUi();
            return true;
        },
        deleteSelectedFloorCell() {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = floorCell;
            const idx = col + row * grid.cols;
            if (grid.floorStore.isPassagePowerSourceAtIdx(idx)) {
                if (!clearPassagePowerSourceAt(state, col, row)) return false;
            } else if (grid.floorStore.isBeltKindAtIdx(idx)) {
                if (!clearFloorCellNavEdit(state, idx)) return false;
            } else if (!grid.clearFloorCell(idx)) return false;
            else markGridZoneSubscriptionsDirty(state);
            placement.forgetFloorPlacement(col, row);
            clearSelection();
            return true;
        },
        setSelectedPassagePowerSourceDefaultPowered(powered) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = floorCell;
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
        setPlacePaletteKey,
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
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        listPlacedForcefields: () => listPlacedForcefields(state.obstacleGrid),
        setSelectedForcefieldMode(mode) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const { col, row, side } = railEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col + row * state.obstacleGrid.cols, side);
            if (!info) return false;
            const allowedSide = mode === PASSAGE_MODE.OneWay ? (info.mode === PASSAGE_MODE.OneWay ? (info.allowedSide ?? side) : side) : side;
            if (!setForcefieldProfileAt(state, col, row, side, mode, allowedSide)) return false;
            notifyUi();
            return true;
        },
        setSelectedForcefieldAllowedSide(allowedSide) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const { col, row, side } = railEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col + row * state.obstacleGrid.cols, side);
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
                if (forcefieldEdgeAt(grid, hit.col + hit.row * grid.cols, hit.side)) {
                    pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                    return true;
                }
                if (!stampForcefieldAt(state, hit.col, hit.row, hit.side, { mode: forcefieldStampMode, allowedSide: hit.side })) return false;
                placement.touchEdgePlacement("forcefield", hit.col, hit.row, hit.side);
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (railWallEdgeAt(state.obstacleGrid, hit.col + hit.row * state.obstacleGrid.cols, hit.side)) {
                    pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                    return true;
                }
                if (!stampRailWallAt(state, hit.col, hit.row, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                placement.touchEdgePlacement("rail", hit.col, hit.row, hit.side);
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            const idx = col + row * state.obstacleGrid.cols;
            if (cellIsStaticWall(state.obstacleGrid, idx)) {
                pickSelection({ kind: "voxel", col, row });
                return true;
            }
            if (!stampVoxelWallAt(state, idx, wallHeightLevel)) return false;
            placement.touchVoxelPlacement(col, row);
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        stampWallAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.stampWallAtWorld(origin.x, origin.y);
        },
        setSelectedVoxelWallHeight(heightLevel) {
            const voxelCell = selectionVoxelCell(sel());
            if (!voxelCell) return false;
            const idx = voxelCell.col + voxelCell.row * state.obstacleGrid.cols;
            if (!setVoxelWallHeightAt(state, idx, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const idx = railEdge.col + railEdge.row * state.obstacleGrid.cols;
            if (!stampRailWallAt(state, idx, railEdge.side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const grid = state.obstacleGrid;
            const idx = railEdge.col + railEdge.row * grid.cols;
            const info = getRailWallInfo(grid, idx, railEdge.side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, idx, newSide)) return false;
            if (!clearRailWallAt(state, idx, railEdge.side)) return false;
            if (!stampRailWallAt(state, idx, newSide, info.heightLevel, info.thicknessLevel)) return false;
            pickSelection({ kind: "rail", col: railEdge.col, row: railEdge.row, side: newSide });
            return true;
        },
        deleteSelectedWall() {
            const voxelCell = selectionVoxelCell(sel());
            if (voxelCell) {
                const idx = voxelCell.col + voxelCell.row * state.obstacleGrid.cols;
                if (!clearVoxelWallAt(state, idx)) return false;
                placement.forgetVoxelPlacement(voxelCell.col, voxelCell.row);
                clearSelection();
                return true;
            }
            const railEdge = selectionRailEdge(sel());
            if (railEdge) {
                const grid = state.obstacleGrid;
                const idx = railEdge.col + railEdge.row * grid.cols;
                if (forcefieldEdgeAt(grid, idx, railEdge.side)) {
                    if (!clearForcefieldAt(state, idx, railEdge.side)) return false;
                    placement.forgetEdgePlacement("forcefield", railEdge.col, railEdge.row, railEdge.side);
                } else if (!clearRailWallAt(state, idx, railEdge.side)) return false;
                else placement.forgetEdgePlacement("rail", railEdge.col, railEdge.row, railEdge.side);
                clearSelection();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail" || wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                const idx = hit.col + hit.row * grid.cols;
                if (wallStampMode === "forcefield") {
                    if (!forcefieldEdgeAt(grid, idx, hit.side)) return false;
                    if (!clearForcefieldAt(state, idx, hit.side)) return false;
                    placement.forgetEdgePlacement("forcefield", hit.col, hit.row, hit.side);
                } else {
                    if (!railWallEdgeAt(grid, idx, hit.side)) return false;
                    if (!clearRailWallAt(state, idx, hit.side)) return false;
                    placement.forgetEdgePlacement("rail", hit.col, hit.row, hit.side);
                }
                selection.dropDeletedWallSelection(hit.col, hit.row, hit.side);
                notifyUi();
                return true;
            }
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            const idx = col + row * grid.cols;
            if (!clearVoxelWallAt(state, idx)) return false;
            placement.forgetVoxelPlacement(col, row);
            selection.dropDeletedWallSelection(col, row);
            notifyUi();
            return true;
        },
        pickAnyWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const edgeHit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (edgeHit) {
                const { col, row, side } = edgeHit;
                if (forcefieldEdgeAt(grid, col + row * grid.cols, side)) {
                    placePaletteKey = "wall:forcefield";
                    wallStampMode = "forcefield";
                    pickSelection({ kind: "rail", col, row, side });
                    return true;
                }
                if (railWallEdgeAt(grid, col + row * grid.cols, side)) {
                    placePaletteKey = "wall:rail";
                    wallStampMode = "rail";
                    pickSelection({ kind: "rail", col, row, side });
                    return true;
                }
            }
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            if (!cellIsStaticWall(grid, col + row * grid.cols)) return false;
            placePaletteKey = "wall:voxel";
            wallStampMode = "voxel";
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !forcefieldEdgeAt(grid, hit.col + hit.row * grid.cols, hit.side)) return false;
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !railWallEdgeAt(grid, hit.col + hit.row * grid.cols, hit.side)) return false;
                pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
                return true;
            }
            const col = grid.worldCol(worldX);
            const row = grid.worldRow(worldY);
            if (!cellIsStaticWall(grid, col + row * grid.cols)) return false;
            pickSelection({ kind: "voxel", col, row });
            return true;
        },
        /** Pick a stamped forcefield edge from the map (Props tab or any panel). */
        pickForcefieldAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (!hit || !forcefieldEdgeAt(grid, hit.col + hit.row * grid.cols, hit.side)) return false;
            pickSelection({ kind: "rail", col: hit.col, row: hit.row, side: hit.side });
            return true;
        },
        getSelectedProp: () => {
            pruneSelection();
            const id = selectionPrimaryPropId(sel(), (id) => registry().getLive(id));
            return id == null ? null : registry().getLive(id);
        },
        pruneSelection,
        deleteProp(prop) {
            if (!prop) return;
            selection.removePropFromSelection(prop.id);
            placement.forgetPropPlacement(prop.id);
            removeProp(prop);
            notifyUi();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        removePropFromSelection(id) {
            if (selection.removePropFromSelection(id)) notifyUi();
        },
        togglePropInSelection(id) {
            return selection.togglePropInSelection(id);
        },
        deleteSelectedProps() {
            const ids = selectionPropIds(sel());
            for (let i = 0; i < ids.length; i++) {
                placement.forgetPropPlacement(ids[i]);
                removeProp(registry().get(ids[i]));
            }
            clearSelection();
            notifyUi();
        },
        getSelectionTagFilter: () => selectionTagFilter,
        setSelectionTagFilter: (filter) => {
            if (selectionTagFilter === filter) return;
            selectionTagFilter = filter;
            notifyUi();
        },
        listSelectedPropEntries,
        selectAllPropsWithTagFilter,
        filterPropSelectionToTag,
        listPlacedProps,
        listPlacedFloorBelts,
        stampPassagePowerSourceAtWorld(worldX, worldY, defaultPowered = false) {
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, defaultPowered)) return false;
            placement.touchFloorPlacement(col, row);
            pickSelection({ kind: "floor", col, row });
            notifyUi();
            return true;
        },
        listPlacedPassagePowerSources,
        ...roomGraph,
        deleteSceneItem(item) {
            removeSceneItem(this, item, pickSelection);
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i]);
            state.obstacleGrid.clearAllFloorCells();
            unbakeRoomGraph(state);
            clearRoomGraph(state);
            selection.clearSelection();
            placement.resetPlacementOrder();
            notifyUi();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync: notifyUi,
    };
}
