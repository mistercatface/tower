import { appendPathOverlayCommands } from "../../Render/overlays/pathOverlayCommands.js";
import { appendSnakeVisionOverlayCommands } from "./snakeVisionOverlays.js";
import { appendSnakeMemoryHeatmapOverlayCommands } from "./snakeMemoryOverlays.js";
import { appendSnakeFsmDebugOverlayCommands } from "./snakeFsmDebugOverlays.js";
import { overlayDirectionArrow } from "../../Render/overlays/overlayCommands.js";
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
        const snakeGame = state.sandbox.snakeGame;
        if (snakeGame) {
            const instance = snakeGame.instancesByHeadId.get(focusedAutosim.headId);
            if (instance && instance.segmentWallPressures)
                for (const [segmentId, record] of instance.segmentWallPressures.entries())
                    if (record.pressure > 0.05) {
                        const prop = state.entityRegistry.getLive(segmentId);
                        if (prop) {
                            const dirX = record.normalX;
                            const dirY = record.normalY;
                            const len = Math.min(25, 5 + record.pressure * 5);
                            const arrows = overlayDirectionArrow(prop.x, prop.y, dirX, dirY, { pad: prop.radius ?? 4, len, stroke: "rgba(244, 67, 54, 0.85)", lineWidth: 2 });
                            out.push(...arrows);
                        }
                    }
        }
    }
}
