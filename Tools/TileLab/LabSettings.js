import {
    gridSettings,
    floorTileSettings,
    mapSettings,
    playerBaseStats,
    combatActorRadius,
} from "../../Config/Config.js";

/** Same canvas footprint used for map spawn / node combat coords as a new game. */
export const mapGenCanvasBounds = {
    width: gridSettings.width,
    height: gridSettings.height,
};

const COMBAT_BASE_RANGE = 150;

/** Combat min zoom — same math as Viewport.updateZoomLimits. */
export function computeCombatZoom(viewWidth, viewHeight, weaponRange = playerBaseStats.range) {
    const visualRadius = Math.max(1, Math.min(viewWidth, viewHeight) / 2 - 4);
    const minZoom = visualRadius / Math.max(1, weaponRange);
    const maxZoom = visualRadius / COMBAT_BASE_RANGE;
    if (maxZoom <= minZoom) {
        return minZoom;
    }
    return minZoom;
}

export function getGameLabDefaults(viewWidth, viewHeight, worldState) {
    const weaponRange = worldState?.player?.weapon?.range ?? playerBaseStats.range;
    return {
        cellSize: gridSettings.cellSize,
        storyCount: floorTileSettings.wallTextureStories,
        weaponRange,
        gameZoom: computeCombatZoom(viewWidth, viewHeight, weaponRange),
        viewPaddingPx: floorTileSettings.viewPaddingPx,
        cellsPerChunk: floorTileSettings.cellsPerChunk,
        texturePixelsPerWorldUnit: floorTileSettings.texturePixelsPerWorldUnit,
        tileWorldSize: floorTileSettings.tileWorldSize ?? gridSettings.cellSize,
        mapGenCanvas: mapGenCanvasBounds,
        playerMoveSpeed: playerBaseStats.speed,
        combatActorRadius,
        mapLayerSpacing: mapSettings.layerSpacing,
        mapCombatScale: mapSettings.combatCoordScale,
    };
}
