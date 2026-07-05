import { formatPropTypeLabel } from "../Props/props.js";
import { visitLiveWorldProps } from "../../GameState/EntityRegistry.js";
import { sandboxAssetMatchesTagFilter } from "./sandboxCapabilities.js";
import { resolveSandboxFaction } from "./sandboxFaction.js";
import { removeSandboxWorldProp } from "./sandboxPlacedSpawn.js";
import { FloorBelt } from "../Spatial/spatial.js";
import { findGridAnchoredFloorPropAtIdx } from "../Props/props.js";
import { applyFloorCellEdit, clearFloorCellNavEdit, commitGridNavEdit } from "../Spatial/spatial.js";
import { unionCellBounds } from "../Spatial/spatial.js";
import propCatalog from "../../Assets/props/index.js";
import {
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    getRailWallInfo,
    hitTestRailWallEdgeAtWorld,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    stampRailWallAt,
    setVoxelWallHeightAt,
    stampVoxelWallAt,
} from "../Spatial/spatial.js";
import { cellIsStaticWall, railWallEdgeAt } from "../Spatial/spatial.js";
import { createSandboxSelection } from "./sandboxSelection.js";
import { selectionFloorCell, selectionPrimaryPropId, selectionPropIds, selectionRailEdge, selectionVoxelCell } from "./sandboxSelectionInspectors.js";
import { createSandboxPlacementOrder } from "./sandboxPlacementOrder.js";
import { createSandboxSpawnSession } from "./sandboxSpawnSession.js";
import { buildSelectionInspector, removeSceneItem, listPlacedSceneItems, matchesSceneItem, pickSceneItem } from "./sandboxScenePlaceables.js";
/** @param {object} state */
export function createSandboxSession(state) {
    let placePaletteKey = "";
    let wallStampMode = "voxel";
    let wallHeightLevel = 1;
    let railThicknessLevel = 4;
    let selectionTagFilter = "all";
    let uiSync = null;
    function notifyUi() {
        uiSync?.();
    }
    const registry = () => state.entityRegistry;
    const placement = createSandboxPlacementOrder(state);
    const selection = createSandboxSelection({ isLiveProp: (id) => !!registry().getLive(id) });
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
    const setPlacePaletteKey = (key) => {
        const hadSelection = selection.getSelection() != null;
        const changed = placePaletteKey !== key;
        placePaletteKey = key;
        if (key.startsWith("wall:")) wallStampMode = /** @type {'voxel' | 'rail'} */ (key.slice(5));
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
            if (!(grid.floorKind[idx] !== 0)) continue;
            const kind = grid.floorKind[idx];
            const index = (counts.get(kind) ?? 0) + 1;
            counts.set(kind, index);
            const facingLabel = FloorBelt.formatFacingLabel(grid.floorFacing[idx]);
            placed.push({ idx, kind, facingIndex: grid.floorFacing[idx], label: `${FloorBelt.formatKindLabel(kind)} #${index} · ${facingLabel}` });
        }
        return placed;
    };
    const spawn = createSandboxSpawnSession(state, { getSpawnPropId: spawnPropIdFromPalette, pickSelection, notifyUi, placement });
    const removeProp = (prop) => removeSandboxWorldProp(state, prop, state.spatialFrame);
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
        const next = new Set();
        for (const id of current.ids) {
            const prop = registry().getLive(id);
            if (prop && sandboxAssetMatchesTagFilter(propCatalog[prop.type], filter)) next.add(id);
        }
        selection.select(next.size === 0 ? null : { kind: "prop", ids: [...next] });
        notifyUi();
    };
    return {
        getSelection: () => sel(),
        pickSelection,
        clearSelection,
        getPlacePaletteKey: () => placePaletteKey,
        setPlacePaletteKey,
        getWallStampMode: () => wallStampMode,
        setWallStampMode(mode) {
            wallStampMode = mode;
            notifyUi();
        },
        getWallHeightLevel: () => wallHeightLevel,
        setWallHeightLevel(level) {
            wallHeightLevel = Math.max(1, Math.min(3, Math.round(level)));
            notifyUi();
        },
        getRailThicknessLevel: () => railThicknessLevel,
        setRailThicknessLevel(level) {
            railThicknessLevel = level;
            notifyUi();
        },
        rotateSelectedFloorBelt(steps = 1) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const idx = floorCell.idx;
            if (!(state.obstacleGrid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (!FloorBelt.rotateOccupantAt(state, idx, steps, commitGridNavEdit)) return false;
            notifyUi();
            return true;
        },
        rotateHoveredGridOccupantAtWorld(worldX, worldY, steps = 1) {
            const occupantIdx = FloorBelt.pickRotatableOccupantAtWorld(state, worldX, worldY);
            if (occupantIdx === -1) return false;
            if (!FloorBelt.rotateOccupantAt(state, occupantIdx, steps, commitGridNavEdit)) return false;
            pickSelection({ kind: "floor", idx: occupantIdx });
            return true;
        },
        moveSelectedFloorBeltTo(targetIdx) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (idx === targetIdx) return true;
            if (!(grid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (!FloorBelt.canStampAt(state, targetIdx, findGridAnchoredFloorPropAtIdx)) return false;
            const kind = grid.floorKind[idx];
            const facingIndex = grid.floorFacing[idx];
            grid.clearFloorCell(idx);
            if (!grid.writeFloorCell(targetIdx, kind, facingIndex)) {
                grid.writeFloorCell(idx, kind, facingIndex);
                return false;
            }
            commitGridNavEdit(state, idx);
            commitGridNavEdit(state, targetIdx);
            pickSelection({ kind: "floor", idx: targetIdx });
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (!(grid.floorKind[idx] !== 0)) {
                clearSelection();
                return false;
            }
            if (grid.floorKind[idx] === kind) return true;
            applyFloorCellEdit(state, idx, kind, grid.floorFacing[idx]);
            notifyUi();
            return true;
        },
        deleteSelectedFloorCell() {
            const floorCell = selectionFloorCell(sel());
            if (!floorCell) return false;
            const grid = state.obstacleGrid;
            const idx = floorCell.idx;
            if (grid.floorKind[idx] !== 0) {
                if (!clearFloorCellNavEdit(state, idx)) return false;
            } else if (!grid.clearFloorCell(idx)) return false;
            else FloorBelt.markZoneSubscriptionsDirty(state);
            placement.forgetFloorPlacement(idx);
            clearSelection();
            return true;
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        stampWallAtWorld(worldX, worldY) {
            const targetIdx = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (railWallEdgeAt(state.obstacleGrid, hit.idx, hit.side)) {
                    pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                    return true;
                }
                if (!stampRailWallAt(state, hit.idx, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                placement.touchEdgePlacement("rail", hit.idx, hit.side);
                pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                return true;
            }
            if (cellIsStaticWall(state.obstacleGrid, targetIdx)) {
                pickSelection({ kind: "voxel", idx: targetIdx });
                return true;
            }
            if (!stampVoxelWallAt(state, targetIdx, wallHeightLevel)) return false;
            placement.touchVoxelPlacement(targetIdx);
            pickSelection({ kind: "voxel", idx: targetIdx });
            return true;
        },
        stampWallAtCameraOrigin() {
            const origin = { x: state.viewport.x, y: state.viewport.y };
            return this.stampWallAtWorld(origin.x, origin.y);
        },
        setSelectedVoxelWallHeight(heightLevel) {
            const voxelCell = selectionVoxelCell(sel());
            if (!voxelCell) return false;
            const idx = voxelCell.idx;
            if (!setVoxelWallHeightAt(state, idx, heightLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const idx = railEdge.idx;
            if (!stampRailWallAt(state, idx, railEdge.side, heightLevel, thicknessLevel)) return false;
            notifyUi();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            const railEdge = selectionRailEdge(sel());
            if (!railEdge) return false;
            const grid = state.obstacleGrid;
            const idx = railEdge.idx;
            const info = getRailWallInfo(grid, idx, railEdge.side);
            if (!info || info.side === newSide) return true;
            if (railWallEdgeAt(grid, idx, newSide)) return false;
            if (!clearRailWallAt(state, idx, railEdge.side)) return false;
            if (!stampRailWallAt(state, idx, newSide, info.heightLevel, info.thicknessLevel)) return false;
            pickSelection({ kind: "rail", idx, side: newSide });
            return true;
        },
        deleteSelectedWall() {
            const voxelCell = selectionVoxelCell(sel());
            if (voxelCell) {
                const idx = voxelCell.idx;
                if (!clearVoxelWallAt(state, idx)) return false;
                placement.forgetVoxelPlacement(idx);
                clearSelection();
                return true;
            }
            const railEdge = selectionRailEdge(sel());
            if (railEdge) {
                const grid = state.obstacleGrid;
                const idx = railEdge.idx;
                if (!clearRailWallAt(state, idx, railEdge.side)) return false;
                placement.forgetEdgePlacement("rail", idx, railEdge.side);
                clearSelection();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                const idx = hit.idx;
                if (!railWallEdgeAt(grid, idx, hit.side)) return false;
                if (!clearRailWallAt(state, idx, hit.side)) return false;
                placement.forgetEdgePlacement("rail", idx, hit.side);
                selection.dropDeletedWallSelection(idx, hit.side);
                notifyUi();
                return true;
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!clearVoxelWallAt(state, idx)) return false;
            placement.forgetVoxelPlacement(idx);
            selection.dropDeletedWallSelection(idx);
            notifyUi();
            return true;
        },
        pickAnyWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const edgeHit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (edgeHit) {
                const { idx, side } = edgeHit;
                if (railWallEdgeAt(grid, idx, side)) {
                    placePaletteKey = "wall:rail";
                    wallStampMode = "rail";
                    pickSelection({ kind: "rail", idx, side });
                    return true;
                }
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!cellIsStaticWall(grid, idx)) return false;
            placePaletteKey = "wall:voxel";
            wallStampMode = "voxel";
            pickSelection({ kind: "voxel", idx });
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !railWallEdgeAt(grid, hit.idx, hit.side)) return false;
                pickSelection({ kind: "rail", idx: hit.idx, side: hit.side });
                return true;
            }
            const idx = grid.worldToIdx(worldX, worldY);
            if (idx === -1) return false;
            if (!cellIsStaticWall(grid, idx)) return false;
            pickSelection({ kind: "voxel", idx });
            return true;
        },
        getSelectedProp: () => {
            pruneSelection();
            const id = selectionPrimaryPropId(sel(), (id) => registry().getLive(id));
            return id == null ? null : registry().getLive(id);
        },
        isSelected(id) {
            const current = sel();
            return current?.kind === "prop" && current.ids.has(id);
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
        placement,
        seedPlacementOrderFromState() {
            placement.resetPlacementOrder();
            const props = listPlacedProps().sort((a, b) => a.id - b.id);
            for (let i = 0; i < props.length; i++) placement.touchPropPlacement(props[i].id);
            for (const entry of listPlacedFloorBelts()) placement.touchFloorPlacement(entry.col, entry.row);
            for (const entry of listPlacedVoxelWalls(state.obstacleGrid)) placement.touchVoxelPlacement(entry.col, entry.row);
            for (const entry of listPlacedRailWalls(state.obstacleGrid)) placement.touchEdgePlacement("rail", entry.col, entry.row, entry.side);
        },
        ...spawn,
        select: pickSelection,
        getSelectionInspector: () => buildSelectionInspector(state, selection, (id) => registry().getLive(id), pruneSelection),
        isWallPlaceMode: () => placePaletteKey.startsWith("wall:"),
        isMapGenPlaceMode: () => placePaletteKey.startsWith("mapGen:"),
        listPlacedSceneItems() {
            return listPlacedSceneItems(this);
        },
        isSceneItemSelected(item) {
            return matchesSceneItem(sel(), item);
        },
        selectSceneItem(item) {
            pickSceneItem(item, { pickSelection, setPlacePaletteKey });
        },
        deleteSceneItem(item) {
            removeSceneItem(this, item, pickSelection);
        },
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state, state.worldProps[i], state.spatialFrame);
            state.obstacleGrid.clearAllFloorCells();
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
