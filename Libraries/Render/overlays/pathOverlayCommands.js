import { normalizeXY } from "../../Math/Vec2.js";
import { overlayCachedArrowHead, overlayCachedFlowDirectionArrow, overlayCachedPathDebugNode, overlayCachedPathDestination, overlayCachedSelectionRing, overlayCircleStroke, overlayPolyline } from "./overlayCommands.js";
/** @typedef {"normal" | "debug"} PathOverlayVisual */
/** @typedef {Object} PathOverlayData
 * @property {"direct" | "hpa" | "flow"} mode
 * @property {number} [propX]
 * @property {number} [propY]
 * @property {number} [propRadius]
 * @property {number} [dirX]
 * @property {number} [dirY]
 * @property {number} [targetX]
 * @property {number} [targetY]
 * @property {Array<{ x: number, y: number }>} [pathNodes]
 * @property {Array<{ x: number, y: number, id?: string }>} [abstractPath]
 * @property {"local" | "hpa"} [pathPlanner]
 */
const FLOW_ARROW_LEN = 20;
const FLOW_ARROW_PAD = 5;
const PATH_STROKE_WIDTH = 2;
const HPA_STROKE_WIDTH = 2.5;
function appendPathEndArrow(out, pathNodes, targetX, targetY, color) {
    if (targetX != null && targetY != null && pathNodes.length >= 1) {
        const from = pathNodes[pathNodes.length - 1];
        const { nx, ny, len } = normalizeXY(targetX - from.x, targetY - from.y);
        if (len > 0) {
            out.push(overlayCachedArrowHead(targetX, targetY, nx, ny, { fill: color }));
            return;
        }
    }
    if (pathNodes.length >= 2) {
        const n = pathNodes.length;
        const tip = pathNodes[n - 1];
        const { nx, ny, len } = normalizeXY(tip.x - pathNodes[n - 2].x, tip.y - pathNodes[n - 2].y);
        if (len > 0) out.push(overlayCachedArrowHead(tip.x, tip.y, nx, ny, { fill: color }));
    }
}
function appendFlowAgentArrow(out, overlay) {
    const { propX, propY, propRadius, dirX, dirY, targetX, targetY } = overlay;
    if (dirX != null && dirY != null) {
        const color = "rgba(76, 175, 80, 0.85)";
        out.push(overlayCachedFlowDirectionArrow(propX, propY, dirX, dirY, { pad: propRadius + FLOW_ARROW_PAD, len: FLOW_ARROW_LEN, stroke: color, lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (targetX != null && targetY != null) out.push(overlayCachedPathDestination(targetX, targetY, 4, { fill: "rgba(255, 193, 7, 0.85)" }));
}
function appendNormalPathOverlayCommands(out, overlay) {
    const { mode, targetX, targetY, pathNodes } = overlay;
    if (mode === "direct") {
        if (pathNodes.length < 2) return;
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.55)", lineWidth: 1.5, dash: [4, 4] }));
        out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        const end = pathNodes[pathNodes.length - 1];
        out.push(overlayCircleStroke(end.x, end.y, 4, { stroke: "rgba(0, 188, 212, 0.85)", lineWidth: PATH_STROKE_WIDTH }));
        return;
    }
    if (mode === "flow") {
        appendFlowAgentArrow(out, overlay);
        return;
    }
    const hpaColor = "rgba(156, 39, 176, 0.9)";
    if (pathNodes.length) out.push(overlayPolyline(pathNodes, { stroke: "rgba(156, 39, 176, 0.65)", lineWidth: HPA_STROKE_WIDTH }));
    appendPathEndArrow(out, pathNodes ?? [], targetX, targetY, hpaColor);
}
function appendAbstractPathCommands(out, abstractPath, grid, pathPlanner = "hpa") {
    if (abstractPath.length < 2) return;
    const isLocal = pathPlanner === "local";
    const lineColor = isLocal ? "#ff9800" : "#ffeb3b";
    const nodeColor = isLocal ? "#ffb74d" : "#ffeb3b";
    const endpointColor = isLocal ? "#f57c00" : "#ff9800";
    
    const points = [];
    for (let i = 0; i < abstractPath.length; i++) {
        const idx = abstractPath[i];
        points.push({ x: grid.gridCenterXByIdx(idx), y: grid.gridCenterYByIdx(idx) });
    }
    out.push(overlayPolyline(points, { stroke: lineColor, lineWidth: 5, dash: [12, 8] }));
    
    for (let i = 0; i < abstractPath.length; i++) {
        const idx = abstractPath[i];
        const isEndpoint = i === 0 || i === abstractPath.length - 1;
        const x = grid.gridCenterXByIdx(idx);
        const y = grid.gridCenterYByIdx(idx);
        out.push(overlayCachedPathDebugNode(x, y, isEndpoint ? 8 : 10, { fill: isEndpoint ? endpointColor : nodeColor }));
    }
}
export function appendPathOverlayCommands(out, overlay, grid, visual = "debug") {
    if (!overlay) return;
    if (visual === "normal") {
        appendNormalPathOverlayCommands(out, overlay);
        return;
    }
    const { mode, targetX, targetY, pathNodes, abstractPath, pathPlanner } = overlay;
    if (mode === "hpa") {
        if (abstractPath) appendAbstractPathCommands(out, abstractPath, grid, pathPlanner ?? "hpa");
        if (pathNodes.length >= 2) out.push(overlayPolyline(pathNodes, { stroke: "#00e5ff", lineWidth: 4 }));
        if (pathNodes.length >= 1) appendPathEndArrow(out, pathNodes, targetX, targetY, "rgba(156, 39, 176, 0.9)");
        for (let i = 0; i < pathNodes.length; i++) out.push(overlayCachedPathDebugNode(pathNodes[i].x, pathNodes[i].y, 6, { fill: "#00e5ff" }));
        return;
    }
    if (mode === "flow") {
        appendFlowAgentArrow(out, overlay);
        return;
    }
    if (pathNodes.length < 2) return;
    out.push(overlayPolyline(pathNodes, { stroke: "rgba(0, 188, 212, 0.65)", lineWidth: 3, dash: [8, 6] }));
    const end = pathNodes[pathNodes.length - 1];
    out.push(overlayCachedPathDestination(end.x, end.y, 10, { fill: "rgba(0, 188, 212, 0.85)" }));
}
