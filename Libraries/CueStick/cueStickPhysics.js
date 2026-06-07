import { normalizeXY } from "../Math/Vec2.js";
/**
 * Finger press = anchor (0,0). Every frame: offset = grip − anchor.
 * Angle and pull-back come only from that offset — no phases, no axis lock.
 *
 * @param {{
 *   anchorX: number,
 *   anchorY: number,
 *   gripX: number,
 *   gripY: number,
 *   pullScale?: number,
 *   maxPull?: number,
 *   lastShotNx?: number | null,
 *   lastShotNy?: number | null,
 *   contactEpsilon?: number,
 * }} spec
 */
export function resolveCueStickFromAnchorDrag({ anchorX, anchorY, gripX, gripY, pullScale = 0.55, maxPull = 52, lastShotNx = null, lastShotNy = null, contactEpsilon = 0.5 }) {
    const dx = gripX - anchorX;
    const dy = gripY - anchorY;
    const { nx, ny, len: drag } = normalizeXY(dx, dy);
    if (drag < contactEpsilon) {
        if (lastShotNx == null || lastShotNy == null) return null;
        return { shotNx: lastShotNx, shotNy: lastShotNy, drag: 0, pullBack: 0 };
    }
    const shotNx = -nx;
    const shotNy = -ny;
    const pullBack = Math.min(maxPull, drag * pullScale);
    return { shotNx, shotNy, drag, pullBack };
}
