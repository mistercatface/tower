import { WorldProp } from "../../Entities/WorldProp.js";
import { getPropAsset, formatPropTypeLabel } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { addWorldPropToState } from "../../GameState/EntityRegistry.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { removeSandboxWorldProp } from "./pullFixtureWalls.js";
import { stepCardinalFacing } from "../Math/Angle.js";
import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { isGridFloorBeltSpawnAsset, isPoolRackSpawnAsset, resolveFloorBeltKindFromSpawnAsset } from "./sandboxCapabilities.js";
import { canStampFloorBeltAt } from "./floorOccupancy.js";
import { spawnPoolRack } from "./spawnPoolRack.js";
import {
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    getRailWallInfo,
    getVoxelWallInfo,
    gridHasRailWall,
    gridHasVoxelWall,
    hitTestRailWallEdgeAtWorld,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    setRailWallAt,
    setVoxelWallHeightAt,
    stampRailWallAt,
    stampVoxelWallAt,
} from "./gridWallEdit.js";
/** @param {object} state @param {{ requestRedraw: () => void, defaultSpawnPropId: string }} options */
export function createSandboxSession(state, { requestRedraw, defaultSpawnPropId }) {
    let spawnPropId = defaultSpawnPropId;
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    /** @type {Set<number>} */
    let selectedPropIds = new Set();
    /** @type {number | null} */
    let selectedPropId = null;
    /** @type {{ col: number, row: number } | null} */
    let selectedFloorCell = null;
    /** @type {'props' | 'walls'} */
    let editorPanelTab = "props";
    /** @type {'voxel' | 'rail'} */
    let wallStampMode = "voxel";
    let wallHeightLevel = 4;
    let railThicknessLevel = 2;
    /** @type {{ col: number, row: number } | null} */
    let selectedVoxelCell = null;
    /** @type {{ col: number, row: number, side: number } | null} */
    let selectedRailEdge = null;
    /** @type {(() => void) | null} */
    let uiSync = null;
    const sync = () => {
        requestRedraw();
        uiSync?.();
    };
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
        selectedPropIds.clear();
        selectedPropId = null;
        selectedRailEdge = null;
        selectedVoxelCell = { col, row };
        sync();
    };
    const setSelectedRailEdge = (col, row, side) => {
        dropFloorSelection();
        selectedPropIds.clear();
        selectedPropId = null;
        selectedVoxelCell = null;
        selectedRailEdge = { col, row, side };
        sync();
    };
    const setSinglePropSelection = (id) => {
        if (id == null) {
            selectedPropIds.clear();
            selectedPropId = null;
            sync();
            return;
        }
        dropFloorSelection();
        dropWallSelection();
        selectedPropIds = new Set([id]);
        selectedPropId = id;
        sync();
    };
    const setSelectedFloorCell = (col, row) => {
        selectedPropIds.clear();
        selectedPropId = null;
        dropWallSelection();
        selectedFloorCell = { col, row };
        sync();
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
            uiSync?.();
        }
    };
    const removePropFromSelection = (propId) => {
        if (!selectedPropIds.delete(propId)) return;
        if (selectedPropId === propId) syncPrimaryFromSet();
    };
    const spawnAt = (worldX, worldY) => {
        const asset = getPropAsset(spawnPropId);
        if (!asset) return null;
        if (isGridFloorBeltSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!canStampFloorBeltAt(state, col, row)) return null;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!grid.writeFloorCell(col, row, kind, 0)) return null;
            setSelectedFloorCell(col, row);
            return null;
        }
        if (isPoolRackSpawnAsset(asset)) {
            const cue = spawnPoolRack(state, worldX, worldY, asset.sandbox.spawnRack, spawnFaction);
            if (cue) setSinglePropSelection(cue.id);
            return cue;
        }
        const prop = new WorldProp(worldX, worldY, spawnPropId, 0);
        prop.faction = spawnFaction;
        addWorldPropToState(state, prop);
        setSinglePropSelection(prop.id);
        return prop;
    };
    return {
        getSpawnPropId: () => spawnPropId,
        setSpawnPropId: (id) => {
            spawnPropId = id;
        },
        getSpawnFaction: () => spawnFaction,
        setSpawnFaction: (faction) => {
            spawnFaction = faction;
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
            sync();
        },
        clearPropSelection: () => {
            setSinglePropSelection(null);
        },
        getSelectedFloorCell: () => selectedFloorCell,
        setSelectedFloorCell,
        clearFloorSelection: () => {
            dropFloorSelection();
            sync();
        },
        rotateSelectedFloorBelt(steps = 1) {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                dropFloorSelection();
                sync();
                return false;
            }
            const kind = grid.floorStore.kind[idx];
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            grid.writeFloorCell(col, row, kind, stepCardinalFacing(facingRadians, steps));
            sync();
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
                sync();
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
            return true;
        },
        setSelectedFloorBeltKind(kind) {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) {
                dropFloorSelection();
                sync();
                return false;
            }
            if (grid.floorStore.kind[idx] === kind) return true;
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            grid.writeFloorCell(col, row, kind, facingRadians);
            sync();
            return true;
        },
        deleteSelectedFloorCell() {
            if (!selectedFloorCell) return false;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (!grid.clearFloorCell(col, row)) return false;
            dropFloorSelection();
            sync();
            return true;
        },
        getSelectedFloorBeltInfo() {
            if (!selectedFloorCell) return null;
            const grid = state.obstacleGrid;
            const { col, row } = selectedFloorCell;
            if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) return null;
            const idx = col + row * grid.cols;
            if (!grid.floorStore.isBeltKindAtIdx(idx)) return null;
            const kind = grid.floorStore.kind[idx];
            const facingIndex = grid.floorStore.facing[idx];
            return { col, row, kind, facingIndex, kindLabel: formatFloorBeltKindLabel(kind), facingLabel: formatFloorBeltFacingLabel(facingIndex) };
        },
        getEditorPanelTab: () => editorPanelTab,
        setEditorPanelTab(tab) {
            if (editorPanelTab === tab) return;
            editorPanelTab = tab;
            if (tab === "walls") {
                selectedPropIds.clear();
                selectedPropId = null;
                dropFloorSelection();
            } else dropWallSelection();
            sync();
        },
        getWallStampMode: () => wallStampMode,
        setWallStampMode(mode) {
            wallStampMode = mode;
            sync();
        },
        getWallHeightLevel: () => wallHeightLevel,
        setWallHeightLevel(level) {
            wallHeightLevel = level;
            sync();
        },
        getRailThicknessLevel: () => railThicknessLevel,
        setRailThicknessLevel(level) {
            railThicknessLevel = level;
            sync();
        },
        getSelectedVoxelCell: () => selectedVoxelCell,
        getSelectedRailEdge: () => selectedRailEdge,
        setSelectedVoxelCell,
        setSelectedRailEdge,
        clearWallSelection: () => {
            dropWallSelection();
            sync();
        },
        listPlacedVoxelWalls: () => listPlacedVoxelWalls(state.obstacleGrid),
        listPlacedRailWalls: () => listPlacedRailWalls(state.obstacleGrid),
        getSelectedVoxelWallInfo: () => (selectedVoxelCell ? getVoxelWallInfo(state.obstacleGrid, selectedVoxelCell.col, selectedVoxelCell.row) : null),
        getSelectedRailWallInfo: () => (selectedRailEdge ? getRailWallInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side) : null),
        stampWallAtWorld(worldX, worldY) {
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(state.obstacleGrid, worldX, worldY);
                if (!hit) return false;
                if (gridHasRailWall(state.obstacleGrid, hit.col, hit.row, hit.side)) {
                    setSelectedRailEdge(hit.col, hit.row, hit.side);
                    return true;
                }
                if (!stampRailWallAt(state, hit.col, hit.row, hit.side, wallHeightLevel, railThicknessLevel)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            if (gridHasVoxelWall(state.obstacleGrid, col, row)) {
                setSelectedVoxelCell(col, row);
                return true;
            }
            if (!stampVoxelWallAt(state, col, row, wallHeightLevel)) return false;
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
            sync();
            return true;
        },
        setSelectedRailWallProps(heightLevel, thicknessLevel) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            if (!setRailWallAt(state, col, row, side, heightLevel, thicknessLevel)) return false;
            sync();
            return true;
        },
        setSelectedRailWallSide(newSide) {
            if (!selectedRailEdge) return false;
            const grid = state.obstacleGrid;
            const { col, row, side } = selectedRailEdge;
            const info = getRailWallInfo(grid, col, row, side);
            if (!info || info.side === newSide) return true;
            if (gridHasRailWall(grid, col, row, newSide)) return false;
            if (!clearRailWallAt(state, col, row, side)) return false;
            if (!stampRailWallAt(state, col, row, newSide, info.heightLevel, info.thicknessLevel)) return false;
            setSelectedRailEdge(col, row, newSide);
            return true;
        },
        deleteSelectedWall() {
            if (selectedVoxelCell) {
                const { col, row } = selectedVoxelCell;
                if (!clearVoxelWallAt(state, col, row)) return false;
                dropWallSelection();
                sync();
                return true;
            }
            if (selectedRailEdge) {
                const { col, row, side } = selectedRailEdge;
                if (!clearRailWallAt(state, col, row, side)) return false;
                dropWallSelection();
                sync();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !gridHasRailWall(grid, hit.col, hit.row, hit.side)) return false;
                if (!clearRailWallAt(state, hit.col, hit.row, hit.side)) return false;
                if (selectedRailEdge?.col === hit.col && selectedRailEdge.row === hit.row && selectedRailEdge.side === hit.side) dropWallSelection();
                sync();
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!clearVoxelWallAt(state, col, row)) return false;
            if (selectedVoxelCell?.col === col && selectedVoxelCell.row === row) dropWallSelection();
            sync();
            return true;
        },
        pickWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !gridHasRailWall(grid, hit.col, hit.row, hit.side)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!gridHasVoxelWall(grid, col, row)) return false;
            setSelectedVoxelCell(col, row);
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
            removeProp(prop);
            sync();
        },
        deletePropById(id) {
            this.deleteProp(registry().get(id));
        },
        deleteSelectedProps() {
            const ids = [...selectedPropIds];
            for (let i = 0; i < ids.length; i++) removeProp(registry().get(ids[i]));
            selectedPropIds.clear();
            selectedPropId = null;
            sync();
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
        clear() {
            for (let i = state.worldProps.length - 1; i >= 0; i--) removeSandboxWorldProp(state.worldProps[i]);
            state.obstacleGrid.clearAllFloorCells();
            selectedPropIds.clear();
            selectedPropId = null;
            dropFloorSelection();
            dropWallSelection();
            sync();
        },
        setUiSync(fn) {
            uiSync = fn;
        },
        sync,
        getState: () => state,
    };
}
