import { syncSurfaceProfile } from "../../Render/game/surfaceProfileResolver.js";
import { getGameWorldSurfaceSettings } from "../../Render/WorldSurfaceBootstrap.js";
import { getWallHeight } from "../WorldSurface/WorldSurfaceSettings.js";
/**
 * Bake/render use per-segment height. Stamp the current game default once at gen time so
 * later tweaks to worldSurface.wallHeight do not resize every unset wall's atlases.
 * @param {object} state
 */
function stampDefaultWallHeights(state) {
    const defaultHeight = getWallHeight(getGameWorldSurfaceSettings());
    for (const wall of state.walls) if (wall.wallHeight == null) wall.wallHeight = defaultHeight;
}
/**
 * Shared post-generation steps after walls are in `state.walls` / spatial index.
 *
 * @param {object} state
 * @param {{ centerX: number, centerY: number, gridBounds?: { centerX: number, centerY: number, width: number, height: number } | null }} focus — hnav + flow-field anchor
 */
export function finalizeGeneratedWorld(state, { centerX, centerY, gridBounds = null }) {
    stampDefaultWallHeights(state);
    if (gridBounds) {
        state.obstacleGrid.rebuildFixed(gridBounds.centerX, gridBounds.centerY, gridBounds.width, gridBounds.height);
        state.obstacleGrid.segmentGrid = new Array(state.obstacleGrid.cols * state.obstacleGrid.rows);
        for (const wall of state.walls) state.obstacleGrid.addWall(wall);
    } else state.obstacleGrid.rebuild(state.walls);
    state.hierarchicalNavigator.initialize(centerX, centerY);
    state.worldSurfaceSeed = (Math.random() * 0x7fffffff) | 0;
    state.worldSurfaces.clear();
    state.roofZLevels = null;
    syncSurfaceProfile(state, centerX, centerY);
}
