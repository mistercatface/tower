import { colRowToIndex } from "../../../Spatial/grid/GridUtils.js";
import { getObserverVisionFrame } from "../../../Navigation/perception/observerVisionFrame.js";
import { getSnakeGameConfig } from "../snakeGameConfig.js";
export function hasLineOfSight(state, seeker, target) {
    const frame = getObserverVisionFrame(state);
    if (!frame) return false;
    const config = getSnakeGameConfig();
    const vision = frame.ensureHeadVision(seeker, config.shared?.visionRange);
    if (!vision || !vision.cellSet) return false;
    const grid = state.obstacleGrid;
    const targetCol = grid.worldCol(target.x);
    const targetRow = grid.worldRow(target.y);
    return vision.cellSet.has(colRowToIndex(targetCol, targetRow, grid.cols));
}
export { createRangedShootIntentState as createGunShootIntentState, resetInstanceRangedCombatAction as clearGunAgentCombatAction } from "../rangedCombat/rangedShootIntentState.js";
