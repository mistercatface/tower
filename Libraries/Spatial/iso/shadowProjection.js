import { projectWorldPointToScreenInto } from "./IsometricProjection.js";
const sScreen = { x: 0, y: 0 };
/** Ground XY for the far edge of a roof-anchored shadow wedge. */
export function shadowGroundContactXY(lx, ly, lightZ, wx, wy, wallTopZ, farDistance = 0) {
    if (lightZ <= wallTopZ) {
        if (farDistance > 0) {
            const dx = wx - lx;
            const dy = wy - ly;
            const dist = Math.hypot(dx, dy);
            if (dist > 0) return { x: lx + (dx / dist) * farDistance, y: ly + (dy / dist) * farDistance };
        }
        return { x: wx, y: wy };
    }
    const t = lightZ / (lightZ - wallTopZ);
    return { x: lx + (wx - lx) * t, y: ly + (wy - ly) * t };
}
/** Screen-space shadow quad: near edge at projected wall top, far edge at ground contacts at z = 0. */
export function projectWallShadowQuadScreenInto(out8, viewport, camera, lx, ly, lightZ, x1, y1, x2, y2, wallTopZ, farDistance = 0) {
    const floor1xy = shadowGroundContactXY(lx, ly, lightZ, x1, y1, wallTopZ, farDistance);
    const floor2xy = shadowGroundContactXY(lx, ly, lightZ, x2, y2, wallTopZ, farDistance);
    projectWorldPointToScreenInto(sScreen, viewport, camera, x1, y1, wallTopZ);
    out8[0] = sScreen.x;
    out8[1] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, camera, x2, y2, wallTopZ);
    out8[2] = sScreen.x;
    out8[3] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, camera, floor2xy.x, floor2xy.y, 0);
    out8[4] = sScreen.x;
    out8[5] = sScreen.y;
    projectWorldPointToScreenInto(sScreen, viewport, camera, floor1xy.x, floor1xy.y, 0);
    out8[6] = sScreen.x;
    out8[7] = sScreen.y;
    return 4;
}
