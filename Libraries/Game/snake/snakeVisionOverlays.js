import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { collectSnakeGoalProps } from "./snakeGoals.js";
import { queryGridCellVision } from "../../Navigation/perception/gridCellVision.js";
import { appendGridCellVisionOverlayCommands } from "../../Navigation/perception/gridCellVisionOverlay.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
function snakeVisionConeConfig() {
    return getSnakeGameConfig().visionCone;
}
export function appendSnakeVisionOverlayCommands(out, state, snakeHeadIds) {
    const config = snakeVisionConeConfig();
    const goals = collectSnakeGoalProps(state);
    const grid = state.obstacleGrid;
    for (let i = 0; i < snakeHeadIds.length; i++) {
        const head = state.entityRegistry.getLive(snakeHeadIds[i]);
        if (!head || head.isDead) continue;
        const vision = queryGridCellVision(head, goals, { halfAngle: config.halfAngle, range: config.range, state });
        appendGridCellVisionOverlayCommands(out, { grid, cells: vision.cells, cellFill: config.cellFill });
        for (let g = 0; g < vision.visible.length; g++) {
            const goal = vision.visible[g];
            const goalRadius = goal.radius ?? 6;
            out.push(overlayCircleFillStroke(goal.x, goal.y, goalRadius + 2, { fill: "rgba(255, 220, 80, 0.2)", stroke: config.visibleGoalStroke, lineWidth: 1 }));
        }
    }
}
