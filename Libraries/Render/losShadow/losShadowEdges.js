import { aabbFromTwoPointsInto, createAabb, distanceSqToAabb } from "../../Math/math.js";
import { projectWallShadowQuadScreenInto } from "../../Spatial/elevation/shadowProjection.js";
import { EDGE_STRIDE } from "./EdgeList.js";
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
function edgeSegmentOutsideCircleFlat(data, base, centerX, centerY, rangeSq) {
    const segment = aabbFromTwoPointsInto(sEdgeSegmentAabb, data[base], data[base + 1], data[base + 2], data[base + 3]);
    return distanceSqToAabb(centerX, centerY, segment.minX, segment.minY, segment.maxX, segment.maxY) > rangeSq;
}
export function forEachLosShadowQuadInRange(edgeList, lightX, lightY, range, lightZ, viewport, quadScratch, emitQuad) {
    const rSq = range * range;
    const count = edgeList.length;
    const data = edgeList.data;
    for (let i = 0; i < count; i++) {
        const base = i * EDGE_STRIDE;
        if (edgeSegmentOutsideCircleFlat(data, base, lightX, lightY, rSq)) continue;
        const x1 = data[base];
        const y1 = data[base + 1];
        const x2 = data[base + 2];
        const y2 = data[base + 3];
        const wallTopZ = data[base + 6];
        const closestX = clampSegmentCoord(x1, x2, lightX);
        const closestY = clampSegmentCoord(y1, y2, lightY);
        const dx = lightX - closestX;
        const dy = lightY - closestY;
        if (dx * dx + dy * dy > rSq) continue;
        projectWallShadowQuadScreenInto(quadScratch, viewport, lightX, lightY, lightZ, x1, y1, x2, y2, wallTopZ, range * 2);
        emitQuad(quadScratch, 4);
    }
}
