import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
import { appendSnakeFsmDebugOverlayCommands } from "./snakeFsmDebugOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { autosimsByHeadId, snakeHeadIds, memoryHeatmapHeadId, fsmDebugHeadId, showVisionCones, showMemoryHeatmap, showSnakeFsmDebug }) {
    if (showVisionCones) appendSnakeVisionOverlayCommands(out, state, snakeHeadIds);
    if (showMemoryHeatmap) appendSnakeMemoryHeatmapOverlayCommands(out, state, autosimsByHeadId.get(memoryHeatmapHeadId).getBrain());
    if (showSnakeFsmDebug) {
        const autosim = autosimsByHeadId.get(fsmDebugHeadId);
        const seeker = state.entityRegistry.getLive(fsmDebugHeadId);
        appendSnakeFsmDebugOverlayCommands(out, state, seeker, autosim.getFsmSnapshot(seeker, state));
    }
}
