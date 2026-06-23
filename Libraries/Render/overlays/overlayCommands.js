import { OVERLAY_RENDER_KEY } from "../../Canvas/QuantizedSpriteCache.js";
import { flowDirectionArrowCacheKey, gridCellHighlightCacheKey, pathArrowHeadCacheKey, pathDestinationCacheKey, selectionRingCacheKey, wireEndpointCacheKey } from "./overlayCacheKeys.js";
/** @typedef {{ renderKey: string, customKey: string, worldSpan: number, anchorX?: number, anchorY?: number }} OverlayCacheMeta */
/** @typedef {{ kind: 'aabb', minX: number, minY: number, maxX: number, maxY: number, fill?: string, stroke?: string, lineWidth?: number, dash?: number[], cache?: OverlayCacheMeta }} OverlayAabbCommand */
/** @typedef {{ kind: 'circleStroke', cx: number, cy: number, r: number, stroke: string, lineWidth?: number, dash?: number[], cache?: OverlayCacheMeta }} OverlayCircleStrokeCommand */
/** @typedef {{ kind: 'circleFillStroke', cx: number, cy: number, r: number, fill: string, stroke?: string, lineWidth?: number, cache?: OverlayCacheMeta }} OverlayCircleFillStrokeCommand */
/** @typedef {{ kind: 'segment', x0: number, y0: number, x1: number, y1: number, stroke: string, lineWidth?: number, dash?: number[], lineCap?: CanvasLineCap }} OverlaySegmentCommand */
/** @typedef {{ kind: 'polyline', points: { x: number, y: number }[], stroke: string, lineWidth?: number, dash?: number[] }} OverlayPolylineCommand */
/** @typedef {{ kind: 'arrowHead', x: number, y: number, dirX: number, dirY: number, fill: string, headLen?: number, headWidth?: number, cache?: OverlayCacheMeta }} OverlayArrowHeadCommand */
/** @typedef {{ kind: 'directionArrow', cx: number, cy: number, dirX: number, dirY: number, pad: number, len: number, stroke: string, lineWidth?: number, headLen?: number, headWidth?: number, cache?: OverlayCacheMeta }} OverlayDirectionArrowCommand */
/** @typedef {{ kind: 'aimSegment', x1: number, y1: number, x2: number, y2: number, color: string, lineWidth?: number, arrowhead?: boolean, glow?: boolean, glowHue?: number }} OverlayAimSegmentCommand */
/** @typedef {OverlayAabbCommand | OverlayCircleStrokeCommand | OverlayCircleFillStrokeCommand | OverlaySegmentCommand | OverlayPolylineCommand | OverlayArrowHeadCommand | OverlayDirectionArrowCommand | OverlayAimSegmentCommand} OverlayCommand */
function overlayCacheMeta(renderKey, customKey, worldSpan, anchorX, anchorY) {
    return { renderKey, customKey, worldSpan, anchorX, anchorY };
}
function overlayGlyphSpan(r, lineWidth = 1, extra = 0) {
    return r * 2 + lineWidth + extra;
}
export function overlayAabb(aabb, { fill, stroke, lineWidth = 1, dash } = {}) {
    return { kind: "aabb", minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.maxY, fill, stroke, lineWidth, dash };
}
export function overlayGridCellHighlight(aabb, cellSize, tint, style) {
    const w = aabb.maxX - aabb.minX;
    const h = aabb.maxY - aabb.minY;
    const anchorX = (aabb.minX + aabb.maxX) * 0.5;
    const anchorY = (aabb.minY + aabb.maxY) * 0.5;
    const cmd = overlayAabb(aabb, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.GridCellHighlight, gridCellHighlightCacheKey(cellSize, tint), Math.max(w, h), anchorX, anchorY);
    return cmd;
}
export function overlayCircleStroke(cx, cy, r, { stroke, lineWidth = 1, dash }) {
    return { kind: "circleStroke", cx, cy, r, stroke, lineWidth, dash };
}
export function overlayCachedSelectionRing(cx, cy, r, style) {
    const cmd = overlayCircleStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.SelectionRing, selectionRingCacheKey(r), overlayGlyphSpan(r, style.lineWidth ?? 1, 4), cx, cy);
    return cmd;
}
export function overlayCircleFillStroke(cx, cy, r, { fill, stroke = "#fff", lineWidth = 1 }) {
    return { kind: "circleFillStroke", cx, cy, r, fill, stroke, lineWidth };
}
export function overlayCachedPathDestination(cx, cy, r, style) {
    const cmd = overlayCircleFillStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.PathDestination, pathDestinationCacheKey(r, style.fill), overlayGlyphSpan(r, style.lineWidth ?? 1), cx, cy);
    return cmd;
}
export function overlayCachedPathDebugNode(cx, cy, r, style) {
    const cmd = overlayCircleFillStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.PathDebugNode, pathDestinationCacheKey(r, style.fill), overlayGlyphSpan(r, style.lineWidth ?? 1), cx, cy);
    return cmd;
}
export function overlayCachedWireEndpoint(cx, cy, r, color) {
    const style = { fill: color, stroke: color, lineWidth: 1 };
    const cmd = overlayCircleFillStroke(cx, cy, r, style);
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.WireEndpoint, wireEndpointCacheKey(r, color), overlayGlyphSpan(r, 1), cx, cy);
    return cmd;
}
export function overlaySegment(x0, y0, x1, y1, { stroke, lineWidth = 1, dash, lineCap }) {
    return { kind: "segment", x0, y0, x1, y1, stroke, lineWidth, dash, lineCap };
}
export function overlayPolyline(points, { stroke, lineWidth = 1, dash }) {
    return { kind: "polyline", points, stroke, lineWidth, dash };
}
export function overlayArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    return { kind: "arrowHead", x, y, dirX, dirY, fill, headLen, headWidth };
}
export function overlayCachedArrowHead(x, y, dirX, dirY, { fill, headLen = 9, headWidth = 6 }) {
    const cmd = overlayArrowHead(x, y, dirX, dirY, { fill, headLen, headWidth });
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.PathArrowHead, pathArrowHeadCacheKey(dirX, dirY, fill, headLen, headWidth), overlayGlyphSpan(Math.max(headLen, headWidth), 1, 2), x, y);
    return cmd;
}
export function overlayCachedFlowDirectionArrow(cx, cy, dirX, dirY, { pad = 0, len = 20, stroke, lineWidth = 2, headLen = 9, headWidth = 6 }) {
    const cmd = { kind: "directionArrow", cx, cy, dirX, dirY, pad, len, stroke, lineWidth, headLen, headWidth };
    cmd.cache = overlayCacheMeta(OVERLAY_RENDER_KEY.FlowDirectionArrow, flowDirectionArrowCacheKey(dirX, dirY, pad, len, stroke, headLen, headWidth), pad + len + headLen + lineWidth + 4, cx, cy);
    return cmd;
}
export function appendOverlayWireLink(out, x0, y0, x1, y1, color, { lineWidth = 2, dash = [6, 4], endpointRadius = 3, live = false } = {}) {
    out.push(overlaySegment(x0, y0, x1, y1, { stroke: color, lineWidth, dash }));
    if (live) out.push(overlayCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 }));
    else out.push(overlayCachedWireEndpoint(x1, y1, endpointRadius, color));
}
export function overlayAimSegment(x1, y1, x2, y2, { color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = {}) {
    return { kind: "aimSegment", x1, y1, x2, y2, color, lineWidth, arrowhead, glow, glowHue };
}
