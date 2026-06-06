/**
 * Cylindrical geometry and quad tessellation for inspect view.
 */
import { transformPoint, projectPoint, averageDepth } from "../camera/InspectCamera.js";
import { triangleNormal, faceVisible } from "./MeshBuilder.js";
import { bodyRadiusAtY, cylinderPoint } from "./CylinderPrimitives.js";
import { inflateQuad } from "../../Math/Screen2D.js";
export function drawSolidQuad(ctx, d0, d1, d2, d3, color, bleedPx = 0) {
    const [p0, p1, p2, p3] = bleedPx > 0 ? inflateQuad(d0, d1, d2, d3, bleedPx) : [d0, d1, d2, d3];
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
} = {}) {
    const halfSpan = angleSpan * 0.5;
    const resolveRadius = (y) => {
        const base = radiusAt ? radiusAt(y) : bodyRadiusAtY(y, halfHeight, bodyRadius, rings);
        return base * radiusInflate;
    };
    const cells = [];
    for (let ri = 0; ri < radialSegments; ri++)
        for (let sri = 0; sri < subRadial; sri++) {
            const u0 = (ri + sri / subRadial) / radialSegments;
            const u1 = (ri + (sri + 1) / subRadial) / radialSegments;
            const a0 = angleCenter - halfSpan + u0 * angleSpan;
            const a1 = angleCenter - halfSpan + u1 * angleSpan;
            for (let vi = 0; vi < verticalSegments; vi++)
                for (let svi = 0; svi < subVertical; svi++) {
                    const v0 = (vi + svi / subVertical) / verticalSegments;
                    const v1 = (vi + (svi + 1) / subVertical) / verticalSegments;
                    const yt = yTop + (yBot - yTop) * v0;
                    const yb = yTop + (yBot - yTop) * v1;
                    const model = [
                        cylinderPoint(yt, a0, resolveRadius(yt)),
                        cylinderPoint(yt, a1, resolveRadius(yt)),
                        cylinderPoint(yb, a1, resolveRadius(yb)),
                        cylinderPoint(yb, a0, resolveRadius(yb)),
                    ];
                    const view = model.map((p) => transformPoint(p, yaw, pitch));
                    const normal = triangleNormal(view[0], view[1], view[2]);
                    if (!faceVisible(normal)) continue;
                    const screen = view.map((p) => projectPoint(p, camera));
                    if (screen.some((p) => !p)) continue;
                    cells.push({ depth: averageDepth(view[0], view[1], view[2]), u0, u1, v0, v1, d0: screen[0], d1: screen[1], d2: screen[2], d3: screen[3] });
                }
        }
    return cells;
}
