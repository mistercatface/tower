import { transformPoint2DInto } from "../Math/Poly2D.js";
export function worldAnchorFromBody(body, localX, localY) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto({ x: 0, y: 0 }, body.x, body.y, localX, localY, cos, sin);
}
export function worldAnchorFromSlab(body, physId, localX, localY, slab) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto({ x: 0, y: 0 }, slab.x[physId], slab.y[physId], localX, localY, cos, sin);
}
export function distanceBetweenAnchors(bodyA, anchorA, bodyB, anchorB) {
    const wa = worldAnchorFromBody(bodyA, anchorA.x, anchorA.y);
    const wb = worldAnchorFromBody(bodyB, anchorB.x, anchorB.y);
    return Math.hypot(wb.x - wa.x, wb.y - wa.y);
}
