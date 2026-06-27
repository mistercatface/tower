import { aabbFromTwoPointsInto, createAabb, distanceSqToAabb } from "../../Math/Aabb2D.js";
import { projectWallShadowQuadScreenInto } from "../../Spatial/iso/shadowProjection.js";
const sEdgeSegmentAabb = createAabb();
function clampSegmentCoord(a, b, v) {
    const lo = a < b ? a : b;
    const hi = a < b ? b : a;
    return v < lo ? lo : v > hi ? hi : v;
}
export function edgeSegmentOutsideCircle(edge, centerX, centerY, rangeSq) {
    const segment = aabbFromTwoPointsInto(sEdgeSegmentAabb, edge.x1, edge.y1, edge.x2, edge.y2);
    return distanceSqToAabb(centerX, centerY, segment.minX, segment.minY, segment.maxX, segment.maxY) > rangeSq;
}
export function forEachLosShadowQuadInRange(edges, lightX, lightY, range, lightZ, viewport, quadScratch, emitQuad) {
    const rSq = range * range;
    for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        if (edgeSegmentOutsideCircle(edge, lightX, lightY, rSq)) continue;
        const closestX = clampSegmentCoord(edge.x1, edge.x2, lightX);
        const closestY = clampSegmentCoord(edge.y1, edge.y2, lightY);
        const dx = lightX - closestX;
        const dy = lightY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        projectWallShadowQuadScreenInto(quadScratch, viewport, lightX, lightY, lightZ, edge.x1, edge.y1, edge.x2, edge.y2, edge.wallTopZ, range * 2);
        emitQuad(quadScratch, 4);
    }
}
