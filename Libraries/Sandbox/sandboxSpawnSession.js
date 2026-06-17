import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION } from "../Combat/sandboxTargeting.js";
import {
    isGridFloorBeltSpawnAsset,
    isGridPassagePowerSourceSpawnAsset,
    isRoomNodeSpawnAsset,
    isRoomLinkSpawnAsset,
    isPuzzleTemplateSpawnAsset,
    resolveFloorBeltKindFromSpawnAsset,
} from "./sandboxCapabilities.js";
import { expandGridForRoomNodeFootprint, stampRoomNodeAt, syncRoomGraphBake, DEFAULT_ROOM_NODE_COLS, DEFAULT_ROOM_NODE_ROWS } from "../RoomGraph/index.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS, stampBeltCratePuzzleAt } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { normalizeAuthoredSurfaceProfileId } from "../RoomGraph/roomGraphSurfaceProfile.js";
import { canStampFloorBeltAt, stampPassagePowerSourceAt } from "./floorOccupancy.js";
import { markGridZoneSubscriptionsDirty } from "./gridZoneTick.js";
import { spawnPlacedSandboxProp } from "./sandboxPlacedSpawn.js";
export function createSandboxSpawnSession(state, { getSpawnPropId, pickSelection, notifyUi, placement }) {
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    let spawnRoomNodeCols = DEFAULT_ROOM_NODE_COLS;
    let spawnRoomNodeRows = DEFAULT_ROOM_NODE_ROWS;
    let spawnPuzzleAreaCols = BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS;
    let spawnPuzzleAreaRows = BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS;
    let spawnCorridorType = CORRIDOR_TYPE_EMPTY;
    let spawnCorridorWidth = 1;
    let spawnRoomNodeSurfaceProfileId = null;
    let spawnCorridorSurfaceProfileId = null;
    const spawnAt = (worldX, worldY) => {
        const spawnPropId = getSpawnPropId();
        const asset = getPropAsset(spawnPropId);
        if (!asset) return false;
        if (isGridFloorBeltSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!canStampFloorBeltAt(state, col, row)) return false;
            const kind = resolveFloorBeltKindFromSpawnAsset(asset);
            if (!grid.writeFloorCell(col, row, kind, 0)) return false;
            markGridZoneSubscriptionsDirty(state);
            placement.touchFloorPlacement(col, row);
            pickSelection({ kind: "floor", col, row });
            return true;
        }
        if (isGridPassagePowerSourceSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            if (!stampPassagePowerSourceAt(state, col, row, false)) return false;
            placement.touchFloorPlacement(col, row);
            pickSelection({ kind: "floor", col, row });
            return true;
        }
        if (isRoomNodeSpawnAsset(asset)) {
            const grid = state.obstacleGrid;
            const { col, row } = grid.worldToGrid(worldX, worldY);
            expandGridForRoomNodeFootprint(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows);
            const node = stampRoomNodeAt(state, col, row, spawnRoomNodeCols, spawnRoomNodeRows, undefined, spawnRoomNodeSurfaceProfileId);
            if (!node) return false;
            placement.touchRoomNodePlacement(node.id);
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
            placement.touchRoomNodePlacement(stamped.roomA.id);
            placement.touchRoomNodePlacement(stamped.roomB.id);
            placement.touchRoomNodePlacement(stamped.roomC.id);
            for (let i = 0; i < stamped.links.length; i++) placement.touchRoomLinkCorridors(stamped.links[i]);
            pickSelection({ kind: "roomNode", id: stamped.roomA.id });
            notifyUi();
            return true;
        }
        if (isRoomLinkSpawnAsset(asset)) return false;
        const spawned = spawnPlacedSandboxProp(state, worldX, worldY, spawnPropId, spawnFaction);
        if (spawned) {
            placement.touchPropPlacement(spawned.id);
            pickSelection({ kind: "prop", ids: [spawned.id] });
        }
        return spawned != null;
    };
    return {
        getSpawnPropId,
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
        spawnAt,
        spawnAtCameraOrigin() {
            return spawnAt(state.viewport.x, state.viewport.y);
        },
    };
}
