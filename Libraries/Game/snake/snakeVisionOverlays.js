import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { collectSnakeFoodProps } from "./snakeFood.js";
import { queryGridCellVision } from "../../Navigation/perception/observerVisionFrame.js";
import { appendGridCellVisionOverlayCommands } from "../../Navigation/perception/gridCellVisionOverlay.js";
import { overlayCircleFillStroke } from "../../Render/overlays/overlayCommands.js";
function snakeVisionConeConfig() {
    return getSnakeGameConfig().visionCone;
}
export function appendSnakeVisionOverlayCommands(out, state, snakeHeadIds) {
    const config = snakeVisionConeConfig();
    const foodProps = collectSnakeFoodProps(state);
    const grid = state.obstacleGrid;
    for (let i = 0; i < snakeHeadIds.length; i++) {
        const head = state.entityRegistry.getLive(snakeHeadIds[i]);
        const vision = queryGridCellVision(head, foodProps, { halfAngle: config.halfAngle, range: config.range, navTopology: state.nav.topology });
        appendGridCellVisionOverlayCommands(out, { grid, cells: vision.cells, cellFill: config.cellFill });
        for (let g = 0; g < vision.visible.length; g++) {
            const food = vision.visible[g];
            out.push(overlayCircleFillStroke(food.x, food.y, (food.radius ?? 3) + 2, { fill: "rgba(255, 220, 80, 0.2)", stroke: config.visibleGoalStroke, lineWidth: 1 }));
        }
    }
}
