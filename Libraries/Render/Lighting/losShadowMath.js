import { projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
const sProj = { x: 0, y: 0 };
/**
 * XY where a ray from the light through (wx, wy, wallTopZ) meets the ground plane z = 0.
 * When the light is at or below wall top the ray is parallel to the floor — drop vertically to (wx, wy).
 */
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
function worldPointToScreen(viewport, camera, worldX, worldY, height) {
    projectWorldPointInto(sProj, worldX, worldY, height, camera);
    return viewport.worldToScreen(sProj.x, sProj.y);
}
/** Screen-space shadow quad: near edge at projected wall top, far edge at ray–ground contacts projected at z = 0. */
export function projectWallShadowQuadScreenInto(out8, viewport, camera, lx, ly, lightZ, x1, y1, x2, y2, wallTopZ, farDistance = 0) {
    const floor1xy = shadowGroundContactXY(lx, ly, lightZ, x1, y1, wallTopZ, farDistance);
    const floor2xy = shadowGroundContactXY(lx, ly, lightZ, x2, y2, wallTopZ, farDistance);
    const roof1 = worldPointToScreen(viewport, camera, x1, y1, wallTopZ);
    const roof2 = worldPointToScreen(viewport, camera, x2, y2, wallTopZ);
    const floor1 = worldPointToScreen(viewport, camera, floor1xy.x, floor1xy.y, 0);
    const floor2 = worldPointToScreen(viewport, camera, floor2xy.x, floor2xy.y, 0);
    out8[0] = roof1.x;
    out8[1] = roof1.y;
    out8[2] = roof2.x;
    out8[3] = roof2.y;
    out8[4] = floor2.x;
    out8[5] = floor2.y;
    out8[6] = floor1.x;
    out8[7] = floor1.y;
    return 4;
}
export function edgeNormalFacesLight(nx, ny, edgeMidX, edgeMidY, lightX, lightY) {
    return nx * (edgeMidX - lightX) + ny * (edgeMidY - lightY) > 0;
}
export function appendShadowQuadToPath(ctx, flatVerts, vertCount) {
    const cross = (flatVerts[2] - flatVerts[0]) * (flatVerts[5] - flatVerts[3]) - (flatVerts[3] - flatVerts[1]) * (flatVerts[4] - flatVerts[2]);
    ctx.moveTo(flatVerts[0], flatVerts[1]);
    if (cross >= 0) for (let p = 1; p < vertCount; p++) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
    else for (let p = vertCount - 1; p > 0; p--) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
}
