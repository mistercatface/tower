import {
    gridSettings,
    floorTileSettings,
    mapSettings,
    playerBaseStats,
    combatActorRadius,
} from "../../Config/Config.js";
import { getDefaultCombatZoom } from "../../Render/Viewport.js";

/** Same canvas footprint used for map spawn / node combat coords as a new game. */
export const mapGenCanvasBounds = {
    width: gridSettings.width,
    height: gridSettings.height,
};

export function getGameLabDefaults(viewWidth, viewHeight, worldState) {
    const weaponRange = worldState?.player?.weapon?.range ?? playerBaseStats.range;
    return {
        cellSize: gridSettings.cellSize,
        storyCount: floorTileSettings.wallTextureStories,
        weaponRange,
        gameZoom: getDefaultCombatZoom(viewWidth, viewHeight, weaponRange),
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
