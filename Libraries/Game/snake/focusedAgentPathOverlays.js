import { getSnakeGameConfig } from "./snakeGameConfig.js";
import { overlayCircleFillStroke, overlayPolyline } from "../../Render/overlays/overlayCommands.js";
const DEFAULT_PREVIEW_CELL_COUNT = 3;
function focusedPathPreviewStyle(config) {
    const style = config.focusedAgentDebug?.pathPreview ?? {};
    return {
        cellCount: style.cellCount ?? DEFAULT_PREVIEW_CELL_COUNT,
        stroke: style.stroke ?? "rgba(156, 39, 176, 0.6)",
        nodeFill: style.nodeFill ?? "rgba(156, 39, 176, 0.22)",
        nodeStroke: style.nodeStroke ?? "rgba(156, 39, 176, 0.75)",
        lineWidthScale: style.lineWidthScale ?? 0.35,
        nodeRadiusScale: style.nodeRadiusScale ?? 0.45,
    };
}
export function appendFocusedAgentPathPreviewCommands(out, pathOverlay, headRadius, config = getSnakeGameConfig()) {
    if (!pathOverlay?.pathNodes?.length) return;
    const style = focusedPathPreviewStyle(config);
    const headR = headRadius ?? 3;
    const lineWidth = Math.max(0.75, headR * style.lineWidthScale);
    const nodeR = Math.max(1.5, headR * style.nodeRadiusScale);
    const nodes = pathOverlay.pathNodes.slice(0, style.cellCount);
    if (nodes.length < 2) return;
    out.push(overlayPolyline(nodes, { stroke: style.stroke, lineWidth }));
    for (let i = 0; i < nodes.length; i++) out.push(overlayCircleFillStroke(nodes[i].x, nodes[i].y, nodeR, { fill: style.nodeFill, stroke: style.nodeStroke, lineWidth: 1 }));
}
