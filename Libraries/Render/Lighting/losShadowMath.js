import { projectWorldPointInto } from "../../Spatial/iso/IsometricProjection.js";
import { LOS_SHADOW_MAX_EXTRUSION_RATIO } from "./losShadowDefaults.js";
const sProj = { x: 0, y: 0 };
export function shadowExtrusionRatio(lightZ, wallTopZ) {
    if (lightZ <= wallTopZ) return LOS_SHADOW_MAX_EXTRUSION_RATIO;
    return lightZ / (lightZ - wallTopZ);
}
export function shadowFloorTip(lx, ly, wx, wy, ratio) {
    return { x: lx + (wx - lx) * ratio, y: ly + (wy - ly) * ratio };
}
function worldPointToScreen(viewport, camera, worldX, worldY, height) {
    projectWorldPointInto(sProj, worldX, worldY, height, camera);
    return viewport.worldToScreen(sProj.x, sProj.y);
}
/** Screen-space shadow quad: near edge at projected wall top, far edge at floor shadow tips. */
export function projectWallShadowQuadScreenInto(out8, viewport, camera, lx, ly, lightZ, x1, y1, x2, y2, wallTopZ) {
    const ratio = shadowExtrusionRatio(lightZ, wallTopZ);
    const tip1 = shadowFloorTip(lx, ly, x1, y1, ratio);
    const tip2 = shadowFloorTip(lx, ly, x2, y2, ratio);
    const roof1 = worldPointToScreen(viewport, camera, x1, y1, wallTopZ);
    const roof2 = worldPointToScreen(viewport, camera, x2, y2, wallTopZ);
    const floor1 = worldPointToScreen(viewport, camera, tip1.x, tip1.y, 0);
    const floor2 = worldPointToScreen(viewport, camera, tip2.x, tip2.y, 0);
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
    if (cross >= 0) {
        for (let p = 1; p < vertCount; p++) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
    } else {
        for (let p = vertCount - 1; p > 0; p--) ctx.lineTo(flatVerts[p * 2], flatVerts[p * 2 + 1]);
    }
}
