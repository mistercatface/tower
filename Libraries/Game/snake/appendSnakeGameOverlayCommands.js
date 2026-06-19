import { getChainMemberIds } from "../../Sandbox/chainLinks.js";
import { resolveAliveSnakeHeadId } from "./snakeLifecycle.js";
import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
import { appendSnakeFsmDebugOverlayCommands } from "./snakeFsmDebugOverlays.js";
export function appendSnakeGameOverlayCommands(out, state, selection, { registry, autosimsByHeadId, snakeHeadIds, memoryHeatmapHeadId, showVisionCones, showMemoryHeatmap, showSnakeFsmDebug }) {
    if (showVisionCones && snakeHeadIds.length) appendSnakeVisionOverlayCommands(out, state, snakeHeadIds);
    if (showMemoryHeatmap && memoryHeatmapHeadId) {
        const brain = autosimsByHeadId.get(memoryHeatmapHeadId)?.getBrain();
        if (brain) appendSnakeMemoryHeatmapOverlayCommands(out, state, brain);
    }
    if (!showSnakeFsmDebug || selection?.kind !== "prop") return;
    const headId = resolveAliveSnakeHeadId(registry, (id) => getChainMemberIds(state, id), selection.id);
    if (!headId) return;
    const autosim = autosimsByHeadId.get(headId);
    const seeker = state.entityRegistry.getLive(headId);
    const snapshot = autosim?.getFsmSnapshot?.();
    if (seeker && snapshot) appendSnakeFsmDebugOverlayCommands(out, state, seeker, snapshot);
}
