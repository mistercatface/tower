import { appendPathOverlayCommands } from "../../Render/overlays/pathOverlayCommands.js";
import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
import { appendSnakeFsmDebugOverlayCommands } from "./snakeFsmDebugOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, { autosimsByHeadId, playerAutosim, showVisionCones, showMemoryHeatmap, showSnakeFsmDebug, showAllSnakeVisionCones }) {
    if (showVisionCones) {
        const snakeHeadIds = showAllSnakeVisionCones ? [...autosimsByHeadId.keys()] : autosimsByHeadId.has(playerAutosim.headId) ? [playerAutosim.headId] : [];
        appendSnakeVisionOverlayCommands(out, state, snakeHeadIds);
    }
    if (showMemoryHeatmap) appendSnakeMemoryHeatmapOverlayCommands(out, state, playerAutosim.getBrain());
    if (showSnakeFsmDebug) {
        const seeker = state.entityRegistry.getLive(playerAutosim.headId);
        appendSnakeFsmDebugOverlayCommands(out, state, seeker, playerAutosim.getFsmSnapshot(seeker, state));
        appendPathOverlayCommands(out, playerAutosim.getPathOverlay(), "normal");
    }
}
