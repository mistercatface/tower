import { quantizeAngleIndex } from "../../Math/Angle.js";
const OVERLAY_RADIUS_STEP = 0.5;
const OVERLAY_DIR_STEPS = 16;
export function quantizeOverlayRadius(r) {
    return Math.max(OVERLAY_RADIUS_STEP, Math.round(r / OVERLAY_RADIUS_STEP) * OVERLAY_RADIUS_STEP);
}
export function quantizeOverlayDirKey(dirX, dirY, steps = OVERLAY_DIR_STEPS) {
    if (dirX == null || dirY == null) return "d0";
    return `d${quantizeAngleIndex(Math.atan2(dirY, dirX), steps)}`;
}
export function selectionRingCacheKey(r) {
    return `r${quantizeOverlayRadius(r)}`;
}
export function pathDestinationCacheKey(r, fill) {
    return `r${quantizeOverlayRadius(r)}_${fill}`;
}
export function pathArrowHeadCacheKey(dirX, dirY, fill, headLen = 9, headWidth = 6) {
    return `${quantizeOverlayDirKey(dirX, dirY)}_${fill}_hl${headLen}_hw${headWidth}`;
}
export function flowDirectionArrowCacheKey(dirX, dirY, pad, len, stroke, headLen = 9, headWidth = 6) {
    return `${quantizeOverlayDirKey(dirX, dirY)}_p${Math.round(pad)}_l${len}_${stroke}_hl${headLen}_hw${headWidth}`;
}
export function wireEndpointCacheKey(r, fill) {
    return `r${quantizeOverlayRadius(r)}_${fill}`;
}
export function gridCellHighlightCacheKey(cellSize, tint) {
    return `cs${cellSize}_${tint}`;
}
