import { getPropAsset, formatPropTypeLabel } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION, resolveSandboxFaction } from "../Combat/sandboxTargeting.js";
import { getSandboxEntityMeta } from "./sandboxEntityMeta.js";
import { removeSandboxWorldProp } from "./pullFixtureWalls.js";
import { stepCardinalFacing } from "../Math/Angle.js";
import { floorBeltFacingFromIndex, formatFloorBeltFacingLabel, formatFloorBeltKindLabel } from "../Spatial/grid/FloorCell.js";
import { isGridFloorBeltSpawnAsset, isGridPassagePowerSourceSpawnAsset, resolveFloorBeltKindFromSpawnAsset } from "./sandboxCapabilities.js";
import { canStampFloorBeltAt, clearPassagePowerSourceAt, stampPassagePowerSourceAt } from "./floorOccupancy.js";
import { syncPassagePowerNetwork, getPassageEdgeNetworkId } from "./passagePowerNetwork.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
import {
    clearForcefieldAt,
    clearPortalAt,
    clearRailWallAt,
    clearVoxelWallAt,
    ensureObstacleGridAtWorld,
    getForcefieldInfo,
    getPortalInfo,
    getRailWallInfo,
    getVoxelWallInfo,
    gridHasForcefield,
    gridHasPortal,
    gridHasRailWall,
    gridHasVoxelWall,
    hitTestRailWallEdgeAtWorld,
    linkPortalsAt,
    listPlacedForcefields,
    listPlacedPortals,
    listPlacedRailWalls,
    listPlacedVoxelWalls,
    listPortalLinkTargets,
    setForcefieldProfileAt,
    setPortalProfileAt,
    setPortalLinkProfileAt,
    setRailWallAt,
    setVoxelWallHeightAt,
    stampForcefieldAt,
    stampPortalAt,
    stampRailWallAt,
    stampVoxelWallAt,
    unlinkPortalAt,
    formatGridWallEdgeSideLabel,
} from "./gridWallEdit.js";
import { PASSAGE_MODE, PORTAL_ACCESS_MODE } from "../Spatial/grid/CellEdge.js";
import { portalAccessDefaultAllowedSide } from "../Spatial/grid/portalAccess.js";
import { cellInRect } from "../Spatial/grid/GridUtils.js";
import { canonicalEdgeCellKey } from "../World/wallGridCells.js";
import { formatPortalConnectionLabel, PORTAL_LINK_MODE } from "./portalLinks.js";
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
    /** @type {string} prop:id or wall:voxel|rail|forcefield|portal */
    let placePaletteKey = `prop:${defaultSpawnPropId}`;
    /** @type {'voxel' | 'rail' | 'forcefield' | 'portal'} */
    let wallStampMode = "voxel";
    let wallHeightLevel = 4;
    let railThicknessLevel = 2;
    let forcefieldStampMode = PASSAGE_MODE.Solid;
    let portalStampMouthNeighbor = false;
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
            setSelectedFloorCell(col, row);
            return true;
        }
        if (isGridPassagePowerSourceSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, false)) return false;
            setSelectedFloorCell(col, row);
            return true;
        }
        const spawned = spawnPlacedSandboxProp(state, worldX, worldY, spawnPropId, spawnFaction);
        if (spawned) setSinglePropSelection(spawned.id);
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
            markGridZoneSubscriptionsDirty(state);
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
                sync();
                return false;
            }
            if (grid.floorStore.kind[idx] === kind) return true;
            const facingRadians = floorBeltFacingFromIndex(grid.floorStore.facing[idx]);
            grid.writeFloorCell(col, row, kind, facingRadians);
            markGridZoneSubscriptionsDirty(state);
            sync();
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
            dropFloorSelection();
            sync();
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
            sync();
            return true;
        },
        getPlacePaletteKey: () => placePaletteKey,
        isWallPlaceMode: () => placePaletteKey.startsWith("wall:"),
        setPlacePaletteKey(key) {
            if (placePaletteKey === key) return;
            placePaletteKey = key;
            if (key.startsWith("wall:")) {
                wallStampMode = /** @type {'voxel' | 'rail' | 'forcefield' | 'portal'} */ (key.slice(5));
                selectedPropIds.clear();
                selectedPropId = null;
                dropFloorSelection();
            } else if (key.startsWith("prop:")) {
                spawnPropId = key.slice(5);
                dropWallSelection();
            }
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
        getForcefieldStampMode: () => forcefieldStampMode,
        setForcefieldStampMode(mode) {
            forcefieldStampMode = mode;
            sync();
        },
        getPortalStampMouthNeighbor: () => portalStampMouthNeighbor,
        setPortalStampMouthNeighbor(neighbor) {
            portalStampMouthNeighbor = neighbor === true;
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
        listPlacedForcefields: () => listPlacedForcefields(state.obstacleGrid),
        listPlacedPortals: () => listPlacedPortals(state.obstacleGrid),
        listPortalLinkTargets: () => {
            if (!selectedRailEdge || !gridHasPortal(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)) return [];
            const { col, row, side } = selectedRailEdge;
            return listPortalLinkTargets(state, state.obstacleGrid, col, row, side);
        },
        getSelectedVoxelWallInfo: () => (selectedVoxelCell ? getVoxelWallInfo(state.obstacleGrid, selectedVoxelCell.col, selectedVoxelCell.row) : null),
        getSelectedRailWallInfo: () =>
            selectedRailEdge && gridHasRailWall(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getRailWallInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null,
        getSelectedForcefieldInfo: () =>
            selectedRailEdge && gridHasForcefield(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                ? getForcefieldInfo(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)
                : null,
        getSelectedPortalInfo: () => {
            if (!selectedRailEdge || !gridHasPortal(state.obstacleGrid, selectedRailEdge.col, selectedRailEdge.row, selectedRailEdge.side)) return null;
            const { col, row, side } = selectedRailEdge;
            const grid = state.obstacleGrid;
            const info = getPortalInfo(grid, col, row, side);
            const networkId = getPassageEdgeNetworkId(state, grid, col, row, side);
            const onNetwork = networkId >= 0;
            const connectionLabel = onNetwork ? (info.linked ? formatPortalConnectionLabel(info.linkMode, info.connection === "fromSelf") : "On network · unlinked") : "Off network";
            return { ...info, sideLabel: formatGridWallEdgeSideLabel(side), onNetwork, networkId, connectionLabel };
        },
        setSelectedForcefieldMode(mode) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col, row, side);
            if (!info) return false;
            const allowedSide = mode === PASSAGE_MODE.OneWay ? (info.mode === PASSAGE_MODE.OneWay ? (info.allowedSide ?? side) : side) : side;
            if (!setForcefieldProfileAt(state, col, row, side, mode, allowedSide)) return false;
            sync();
            return true;
        },
        setSelectedForcefieldAllowedSide(allowedSide) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            const info = getForcefieldInfo(state.obstacleGrid, col, row, side);
            if (!info || info.mode !== PASSAGE_MODE.OneWay) return false;
            if (!setForcefieldProfileAt(state, col, row, side, PASSAGE_MODE.OneWay, allowedSide)) return false;
            sync();
            return true;
        },
        setSelectedPortalMouthSide(allowedSide) {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            const info = getPortalInfo(state.obstacleGrid, col, row, side);
            if (!info) return false;
            if (!setPortalProfileAt(state, col, row, side, PORTAL_ACCESS_MODE.One, allowedSide)) return false;
            sync();
            return true;
        },
        linkSelectedPortalTo(col, row, side) {
            if (!selectedRailEdge) return false;
            const { col: colA, row: rowA, side: sideA } = selectedRailEdge;
            if (!linkPortalsAt(state, colA, rowA, sideA, col, row, side)) return false;
            sync();
            return true;
        },
        unlinkSelectedPortal() {
            if (!selectedRailEdge) return false;
            const { col, row, side } = selectedRailEdge;
            if (!unlinkPortalAt(state, col, row, side)) return false;
            sync();
            return true;
        },
        setSelectedPortalConnection(connection) {
            if (!selectedRailEdge) return false;
            const grid = state.obstacleGrid;
            const { col, row, side } = selectedRailEdge;
            const info = getPortalInfo(grid, col, row, side);
            if (!info?.linked) return false;
            if (connection === "shared") {
                if (!setPortalLinkProfileAt(state, col, row, side, PORTAL_LINK_MODE.Shared, 0)) return false;
            } else if (connection === "fromSelf") {
                if (!setPortalLinkProfileAt(state, col, row, side, PORTAL_LINK_MODE.OneWay, canonicalEdgeCellKey(grid, col, row, side))) return false;
            } else if (connection === "fromPartner") {
                const partner = info.partner;
                if (!partner) return false;
                if (!setPortalLinkProfileAt(state, col, row, side, PORTAL_LINK_MODE.OneWay, canonicalEdgeCellKey(grid, partner.col, partner.row, partner.side))) return false;
            } else return false;
            sync();
            return true;
        },
        stampWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (wallStampMode === "portal") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                if (gridHasPortal(grid, hit.col, hit.row, hit.side)) {
                    setSelectedRailEdge(hit.col, hit.row, hit.side);
                    return true;
                }
                const allowedSide = portalStampMouthNeighbor ? hit.side : portalAccessDefaultAllowedSide(hit.side);
                if (!stampPortalAt(state, hit.col, hit.row, hit.side, { accessMode: PORTAL_ACCESS_MODE.One, allowedSide })) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                sync();
                return true;
            }
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                if (gridHasForcefield(grid, hit.col, hit.row, hit.side)) {
                    setSelectedRailEdge(hit.col, hit.row, hit.side);
                    return true;
                }
                if (!stampForcefieldAt(state, hit.col, hit.row, hit.side, { mode: forcefieldStampMode, allowedSide: hit.side })) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                sync();
                return true;
            }
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
                const grid = state.obstacleGrid;
                if (gridHasForcefield(grid, col, row, side)) {
                    if (!clearForcefieldAt(state, col, row, side)) return false;
                } else if (gridHasPortal(grid, col, row, side)) {
                    if (!clearPortalAt(state, col, row, side)) return false;
                } else if (!clearRailWallAt(state, col, row, side)) return false;
                dropWallSelection();
                sync();
                return true;
            }
            return false;
        },
        deleteWallAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            if (wallStampMode === "rail" || wallStampMode === "forcefield" || wallStampMode === "portal") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit) return false;
                if (wallStampMode === "portal") {
                    if (!gridHasPortal(grid, hit.col, hit.row, hit.side)) return false;
                    if (!clearPortalAt(state, hit.col, hit.row, hit.side)) return false;
                } else if (wallStampMode === "forcefield") {
                    if (!gridHasForcefield(grid, hit.col, hit.row, hit.side)) return false;
                    if (!clearForcefieldAt(state, hit.col, hit.row, hit.side)) return false;
                } else {
                    if (!gridHasRailWall(grid, hit.col, hit.row, hit.side)) return false;
                    if (!clearRailWallAt(state, hit.col, hit.row, hit.side)) return false;
                }
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
            if (wallStampMode === "portal") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !gridHasPortal(grid, hit.col, hit.row, hit.side)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
            if (wallStampMode === "forcefield") {
                const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
                if (!hit || !gridHasForcefield(grid, hit.col, hit.row, hit.side)) return false;
                setSelectedRailEdge(hit.col, hit.row, hit.side);
                return true;
            }
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
        /** Pick a stamped forcefield edge from the map (Props tab or any panel). */
        pickForcefieldAtWorld(worldX, worldY) {
            const grid = state.obstacleGrid;
            const hit = hitTestRailWallEdgeAtWorld(grid, worldX, worldY);
            if (!hit || !gridHasForcefield(grid, hit.col, hit.row, hit.side)) return false;
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
        stampPassagePowerSourceAtWorld(worldX, worldY, defaultPowered = false) {
            const { col, row } = ensureObstacleGridAtWorld(state, worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, defaultPowered)) return false;
            setSelectedFloorCell(col, row);
            sync();
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
