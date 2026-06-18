import { getPropAsset } from "../Props/PropCatalog.js";
import { SANDBOX_DEFAULT_FACTION } from "./sandboxFaction.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { normalizeAuthoredSurfaceProfileId } from "../RoomGraph/roomGraphSurfaceProfile.js";
import { DEFAULT_ROOM_NODE_COLS, DEFAULT_ROOM_NODE_ROWS } from "../RoomGraph/index.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { spawnPlaceableAt } from "./sandboxScenePlaceables.js";
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
    const spawnCtx = () => ({
        spawnPropId: getSpawnPropId(),
        spawnFaction,
        spawnRoomNodeCols,
        spawnRoomNodeRows,
        spawnPuzzleAreaCols,
        spawnPuzzleAreaRows,
        spawnRoomNodeSurfaceProfileId,
        pickSelection,
        notifyUi,
        placement,
    });
    const spawnAt = (worldX, worldY) => {
        const asset = getPropAsset(getSpawnPropId());
        if (!asset) return false;
        return spawnPlaceableAt(state, worldX, worldY, asset, spawnCtx());
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
