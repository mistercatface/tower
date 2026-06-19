import { appendPathOverlayCommands } from "../../Render/overlays/pathOverlayCommands.js";
import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
import { appendSnakeFsmDebugOverlayCommands } from "./snakeFsmDebugOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { autosimsByHeadId, focusedAutosim, showVisionCones, showMemoryHeatmap, showSnakeFsmDebug, showAllSnakeVisionCones }) {
    if (!focusedAutosim) return;
    if (showVisionCones) {
        const snakeHeadIds = showAllSnakeVisionCones ? [...autosimsByHeadId.keys()] : autosimsByHeadId.has(focusedAutosim.headId) ? [focusedAutosim.headId] : [];
        appendSnakeVisionOverlayCommands(out, state, snakeHeadIds);
    }
    if (showMemoryHeatmap) appendSnakeMemoryHeatmapOverlayCommands(out, state, focusedAutosim.getBrain());
    if (showSnakeFsmDebug) {
        const seeker = state.entityRegistry.getLive(focusedAutosim.headId);
        appendSnakeFsmDebugOverlayCommands(out, state, seeker, focusedAutosim.getFsmSnapshot(seeker, state));
        appendPathOverlayCommands(out, focusedAutosim.getPathOverlay(), "normal");
    }
}
