import { getPropAsset } from "../Props/PropCatalog.js";
import { hexToPropTintHue } from "../Props/propTint.js";
import { SANDBOX_DEFAULT_FACTION } from "./sandboxFaction.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { normalizeAuthoredSurfaceProfileId } from "../RoomGraph/roomGraphSurfaceProfile.js";
import { DEFAULT_ROOM_NODE_COLS, DEFAULT_ROOM_NODE_ROWS } from "../RoomGraph/index.js";
import { BELT_CRATE_PUZZLE_DEFAULT_AREA_COLS, BELT_CRATE_PUZZLE_DEFAULT_AREA_ROWS } from "../RoomGraph/puzzleTemplateBeltCrate.js";
import { DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT, DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH } from "./sandboxCapabilities.js";
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
    let spawnBoxWidth = DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH;
    let spawnBoxHeight = DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT;
    let spawnPropTintEnabled = false;
    let spawnPropTintHue = null;
    const resolveSpawnPropTintHue = (asset) => {
        if (!spawnPropTintEnabled) return null;
        if (spawnPropTintHue != null) return spawnPropTintHue;
        const fallback = asset?.visuals?.panels?.[0];
        return fallback ? hexToPropTintHue(fallback) : 0;
    };
    const spawnCtx = () => ({
        spawnPropId: getSpawnPropId(),
        spawnFaction,
        spawnPropTintEnabled,
        spawnPropTintHue,
        resolveSpawnPropTintHue,
        spawnRoomNodeCols,
        spawnRoomNodeRows,
        spawnPuzzleAreaCols,
        spawnPuzzleAreaRows,
        spawnRoomNodeSurfaceProfileId,
        spawnBoxHalfExtents: { x: spawnBoxWidth / 2, y: spawnBoxHeight / 2 },
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
        getSpawnBoxWidth: () => spawnBoxWidth,
        setSpawnBoxWidth: (width) => {
            spawnBoxWidth = Math.max(6, Math.min(128, Math.round(width)));
            notifyUi();
        },
        getSpawnBoxHeight: () => spawnBoxHeight,
        setSpawnBoxHeight: (height) => {
            spawnBoxHeight = Math.max(6, Math.min(128, Math.round(height)));
            notifyUi();
        },
        isSpawnPropTintEnabled: () => spawnPropTintEnabled,
        setSpawnPropTintEnabled: (enabled) => {
            spawnPropTintEnabled = enabled;
            notifyUi();
        },
        getSpawnPropTintHue: () => spawnPropTintHue,
        setSpawnPropTintHue: (hue) => {
            spawnPropTintHue = hue;
        },
        resolveSpawnPropTintHue,
        spawnAt,
        spawnAtCameraOrigin() {
            return spawnAt(state.viewport.x, state.viewport.y);
        },
    };
}
