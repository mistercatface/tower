import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { appendSpatialCellMemoryOverlayCommands } from "../../AI/brain/spatialCellMemoryOverlay.js";
export function appendSnakeMemoryHeatmapOverlayCommands(out, state, brain) {
    const config = getSnakeGameConfig();
    appendSpatialCellMemoryOverlayCommands(out, { grid: state.obstacleGrid, spatial: brain.spatial, style: config.memoryHeatmap, bucketCount: config.memoryHeatmap.bucketCount });
}
