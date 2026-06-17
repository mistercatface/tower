import { projectWallShadowQuadScreenInto } from "../../Spatial/iso/shadowProjection.js";
function clampSegmentCoord(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
export function forEachLosShadowQuadInRange(edges, lightX, lightY, range, lightZ, viewport, camera, quadScratch, emitQuad) {
    const rSq = range * range;
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        const closestX = clampSegmentCoord(edge.x1, edge.x2, lightX);
        const closestY = clampSegmentCoord(edge.y1, edge.y2, lightY);
        const dx = lightX - closestX;
        const dy = lightY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        projectWallShadowQuadScreenInto(quadScratch, viewport, camera, lightX, lightY, lightZ, edge.x1, edge.y1, edge.x2, edge.y2, edge.wallTopZ, range * 2);
        emitQuad(quadScratch, 4);
    }
}
