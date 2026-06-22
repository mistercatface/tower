import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { autosimsByHeadId, focusedAutosim, showVisionCones, showMemoryHeatmap, showAllSnakeVisionCones }) {
    if (!focusedAutosim) return;
    if (showVisionCones) {
        const snakeHeadIds = showAllSnakeVisionCones ? [...autosimsByHeadId.keys()] : autosimsByHeadId.has(focusedAutosim.headId) ? [focusedAutosim.headId] : [];
        appendSnakeVisionOverlayCommands(out, state, snakeHeadIds);
    }
    if (showMemoryHeatmap) appendSnakeMemoryHeatmapOverlayCommands(out, state, focusedAutosim.getBrain());
}
