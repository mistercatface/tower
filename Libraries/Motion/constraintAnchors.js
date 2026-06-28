import { transformPoint2DInto } from "../Math/Poly2D.js";
const distAnchorA = { x: 0, y: 0 };
const distAnchorB = { x: 0, y: 0 };
export function worldAnchorFromBody(body, localX, localY, dst) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto(dst, body.x, body.y, localX, localY, cos, sin);
}
export function worldAnchorFromSlab(body, physId, localX, localY, slab, dst) {
    const angle = body.facing ?? body.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return transformPoint2DInto(dst, slab.x[physId], slab.y[physId], localX, localY, cos, sin);
}
export function distanceBetweenAnchors(bodyA, anchorA, bodyB, anchorB) {
    worldAnchorFromBody(bodyA, anchorA.x, anchorA.y, distAnchorA);
    worldAnchorFromBody(bodyB, anchorB.x, anchorB.y, distAnchorB);
    return Math.hypot(distAnchorB.x - distAnchorA.x, distAnchorB.y - distAnchorA.y);
}
