import { sampleAssetBaseTintHex } from "../Color/visualOverride.js";
import { SANDBOX_DEFAULT_FACTION } from "./sandboxFaction.js";
import { CORRIDOR_TYPE_EMPTY, normalizeCorridorType } from "../RoomGraph/roomGraphCorridorTypes.js";
import { DEFAULT_ROOM_NODE_COLS, DEFAULT_ROOM_NODE_ROWS } from "../RoomGraph/index.js";
import { DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT, DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH } from "./sandboxCapabilities.js";
import { assetDefaultBallRadius, isShapeFamilyAsset } from "./sandboxShapeFamilies.js";
import { spawnPlaceableAt } from "./sandboxScenePlaceables.js";
import propCatalog from "../../Assets/props/index.js";
export function createSandboxSpawnSession(state, { getSpawnPropId, pickSelection, notifyUi, placement }) {
    let spawnFaction = SANDBOX_DEFAULT_FACTION;
    let spawnRoomNodeCols = DEFAULT_ROOM_NODE_COLS;
    let spawnRoomNodeRows = DEFAULT_ROOM_NODE_ROWS;
    let spawnCorridorType = CORRIDOR_TYPE_EMPTY;
    let spawnCorridorWidth = 1;
    let spawnBoxWidth = DEFAULT_RESIZABLE_BOX_SPAWN_WIDTH;
    let spawnBoxHeight = DEFAULT_RESIZABLE_BOX_SPAWN_HEIGHT;
    let spawnCrossLength = 32;
    let spawnCrossThickness = 8;
    let spawnBallRadius = null;
    let spawnVisualOverrideTint = null;
    let spawnVisualOverrideBrightness = 1;
    let spawnSnakeLength = 5;
    const resolveSpawnVisualOverride = (asset) => {
        if (!isShapeFamilyAsset(asset)) return null;
        const tint = spawnVisualOverrideTint ?? sampleAssetBaseTintHex(asset);
        const visualOverride = { tint };
        if (spawnVisualOverrideBrightness !== 1) visualOverride.brightness = spawnVisualOverrideBrightness;
        return visualOverride;
    };
    const spawnCtx = (options = {}) => ({
        spawnPropId: getSpawnPropId(),
        spawnFaction,
        resolveSpawnPropTypeId: getSpawnPropId,
        resolveSpawnVisualOverride,
        spawnBallRadius: spawnBallRadius ?? assetDefaultBallRadius(propCatalog[getSpawnPropId()]),
        spawnRoomNodeCols,
        spawnRoomNodeRows,
        spawnBoxHalfExtents: { x: spawnBoxWidth / 2, y: spawnBoxHeight / 2 },
        spawnCrossLength,
        spawnCrossThickness,
        spawnSnakeLength,
        pickSelection,
        notifyUi,
        placement,
        selectSpawned: options.selectSpawned !== false,
    });
    const spawnAt = (worldX, worldY, options = {}) => {
        const asset = propCatalog[getSpawnPropId()];
        if (!asset) return false;
        return spawnPlaceableAt(state, worldX, worldY, asset, spawnCtx(options));
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
        getSpawnBallRadius: (asset) => spawnBallRadius ?? assetDefaultBallRadius(asset),
        setSpawnBallRadius: (radius) => {
            spawnBallRadius = Math.max(1, Math.min(32, Math.round(radius)));
            notifyUi();
        },
        getSpawnVisualOverrideTint: (asset) => spawnVisualOverrideTint ?? sampleAssetBaseTintHex(asset),
        setSpawnVisualOverrideTint: (hex) => {
            spawnVisualOverrideTint = hex;
        },
        getSpawnVisualOverrideBrightness: () => spawnVisualOverrideBrightness,
        setSpawnVisualOverrideBrightness: (brightness) => {
            spawnVisualOverrideBrightness = Math.max(0.25, Math.min(2, brightness));
        },
        getSpawnCrossLength: () => spawnCrossLength,
        setSpawnCrossLength: (len) => {
            spawnCrossLength = Math.max(8, Math.min(128, Math.round(len)));
            notifyUi();
        },
        getSpawnCrossThickness: () => spawnCrossThickness,
        setSpawnCrossThickness: (thick) => {
            spawnCrossThickness = Math.max(2, Math.min(64, Math.round(thick)));
            notifyUi();
        },
        getSpawnSnakeLength: () => spawnSnakeLength,
        setSpawnSnakeLength: (len) => {
            spawnSnakeLength = Math.max(3, Math.min(9, Math.round(len)));
            notifyUi();
        },
        resolveSpawnVisualOverride,
        spawnAt,
        spawnAtCameraOrigin() {
            return spawnAt(state.viewport.x, state.viewport.y);
        },
    };
}
