/**
 * Shared cylindrical quad tessellation for inspect view (body + label).
 */
import {
    transformPoint,
    projectPoint,
    faceVisible,
    triangleNormal,
    averageDepth,
} from "./core/Mesh3D.js";
import { bodyRadiusAtY } from "./CylinderMesh.js";

export function cylinderPoint(y, angle, radius) {
    return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
}

export function inflateQuad(d0, d1, d2, d3, px) {
    const cx = (d0.x + d1.x + d2.x + d3.x) / 4;
    const cy = (d0.y + d1.y + d2.y + d3.y) / 4;
    const puff = (p) => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        return { x: p.x + (dx / len) * px, y: p.y + (dy / len) * px };
    };
    return [puff(d0), puff(d1), puff(d2), puff(d3)];
}

export function drawSolidQuad(ctx, d0, d1, d2, d3, color, bleedPx = 0) {
    const [p0, p1, p2, p3] = bleedPx > 0
        ? inflateQuad(d0, d1, d2, d3, bleedPx)
        : [d0, d1, d2, d3];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
}

/**
 * Tessellate a cylindrical band into front-facing screen quads.
 * @returns {{ depth: number, d0: object, d1: object, d2: object, d3: object, u0: number, u1: number, v0: number, v1: number }[]}
 */
export function tessellateCylinderQuads({
    halfHeight,
    bodyRadius,
    rings = null,
    yaw,
    pitch,
    camera,
    yBot,
    yTop,
    angleCenter = 0,
    angleSpan = Math.PI * 2,
    radialSegments = 24,
    verticalSegments = 18,
    subRadial = 2,
    subVertical = 2,
    radiusInflate = 1,
    radiusAt = null,
}) {
    const halfSpan = angleSpan * 0.5;
    const resolveRadius = (y) => {
        const base = radiusAt
            ? radiusAt(y)
            : bodyRadiusAtY(y, halfHeight, bodyRadius, rings);
        return base * radiusInflate;
    };

    const cells = [];
    const halfSpanAngle = halfSpan;

    for (let ri = 0; ri < radialSegments; ri++) {
        for (let sri = 0; sri < subRadial; sri++) {
            const u0 = (ri + sri / subRadial) / radialSegments;
            const u1 = (ri + (sri + 1) / subRadial) / radialSegments;
            const a0 = angleCenter - halfSpanAngle + u0 * angleSpan;
            const a1 = angleCenter - halfSpanAngle + u1 * angleSpan;

            for (let vi = 0; vi < verticalSegments; vi++) {
                for (let svi = 0; svi < subVertical; svi++) {
                    const v0 = (vi + svi / subVertical) / verticalSegments;
                    const v1 = (vi + (svi + 1) / subVertical) / verticalSegments;
                    const yt = yTop + (yBot - yTop) * v0;
                    const yb = yTop + (yBot - yTop) * v1;

                    const rTop0 = resolveRadius(yt);
                    const rTop1 = resolveRadius(yt);
                    const rBot0 = resolveRadius(yb);
                    const rBot1 = resolveRadius(yb);

                    const model = [
                        cylinderPoint(yt, a0, rTop0),
                        cylinderPoint(yt, a1, rTop1),
                        cylinderPoint(yb, a1, rBot1),
                        cylinderPoint(yb, a0, rBot0),
                    ];

                    const view = model.map((p) => transformPoint(p, yaw, pitch));
                    const normal = triangleNormal(view[0], view[1], view[2]);
                    if (!faceVisible(normal)) continue;

                    const screen = view.map((p) => projectPoint(p, camera));
                    if (screen.some((p) => !p)) continue;

                    cells.push({
                        depth: averageDepth(view[0], view[1], view[2]),
                        u0, u1, v0, v1,
                        d0: screen[0],
                        d1: screen[1],
                        d2: screen[2],
                        d3: screen[3],
                    });
                }
            }
        }
    }

    return cells;
}
