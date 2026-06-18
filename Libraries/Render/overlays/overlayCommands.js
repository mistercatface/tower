/** @typedef {{ kind: 'aabb', minX: number, minY: number, maxX: number, maxY: number, fill?: string, stroke?: string, lineWidth?: number, dash?: number[] }} OverlayAabbCommand */
/** @typedef {{ kind: 'circleStroke', cx: number, cy: number, r: number, stroke: string, lineWidth?: number, dash?: number[] }} OverlayCircleStrokeCommand */
/** @typedef {{ kind: 'circleFillStroke', cx: number, cy: number, r: number, fill: string, stroke?: string, lineWidth?: number }} OverlayCircleFillStrokeCommand */
/** @typedef {{ kind: 'segment', x0: number, y0: number, x1: number, y1: number, stroke: string, lineWidth?: number, dash?: number[], lineCap?: CanvasLineCap }} OverlaySegmentCommand */
/** @typedef {{ kind: 'polyline', points: { x: number, y: number }[], stroke: string, lineWidth?: number, dash?: number[] }} OverlayPolylineCommand */
/** @typedef {{ kind: 'arrowHead', x: number, y: number, dirX: number, dirY: number, fill: string, headLen?: number, headWidth?: number }} OverlayArrowHeadCommand */
/** @typedef {{ kind: 'aimSegment', x1: number, y1: number, x2: number, y2: number, color: string, lineWidth?: number, arrowhead?: boolean, glow?: boolean, glowHue?: number }} OverlayAimSegmentCommand */
/** @typedef {OverlayAabbCommand | OverlayCircleStrokeCommand | OverlayCircleFillStrokeCommand | OverlaySegmentCommand | OverlayPolylineCommand | OverlayArrowHeadCommand | OverlayAimSegmentCommand} OverlayCommand */
export function overlayAabb(aabb, { fill, stroke, lineWidth = 1, dash } = {}) {
    return { kind: "aabb", minX: aabb.minX, minY: aabb.minY, maxX: aabb.maxX, maxY: aabb.maxY, fill, stroke, lineWidth, dash };
}
export function overlayCircleStroke(cx, cy, r, { stroke, lineWidth = 1, dash }) {
    return { kind: "circleStroke", cx, cy, r, stroke, lineWidth, dash };
}
export function overlayCircleFillStroke(cx, cy, r, { fill, stroke = "#fff", lineWidth = 1 }) {
    return { kind: "circleFillStroke", cx, cy, r, fill, stroke, lineWidth };
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
export function overlayDirectionArrow(cx, cy, dirX, dirY, { pad = 0, len = 20, stroke, lineWidth = 2, headLen = 9, headWidth = 6 }) {
    const startX = cx + dirX * pad;
    const startY = cy + dirY * pad;
    const tipX = startX + dirX * len;
    const tipY = startY + dirY * len;
    return [overlaySegment(startX, startY, tipX, tipY, { stroke, lineWidth }), overlayArrowHead(tipX, tipY, dirX, dirY, { fill: stroke, headLen, headWidth })];
}
export function overlayWireLink(x0, y0, x1, y1, color, { lineWidth = 2, dash = [6, 4], endpointRadius = 3 } = {}) {
    return [overlaySegment(x0, y0, x1, y1, { stroke: color, lineWidth, dash }), overlayCircleFillStroke(x1, y1, endpointRadius, { fill: color, stroke: color, lineWidth: 1 })];
}
export function appendOverlayWireLink(out, x0, y0, x1, y1, color, style) {
    out.push(...overlayWireLink(x0, y0, x1, y1, color, style));
}
export function overlayAimSegment(x1, y1, x2, y2, { color, lineWidth = 3, arrowhead = true, glow = true, glowHue = 180 } = {}) {
    return { kind: "aimSegment", x1, y1, x2, y2, color, lineWidth, arrowhead, glow, glowHue };
}
