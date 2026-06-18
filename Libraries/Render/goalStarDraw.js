import { traceClosedPolygon } from "../Canvas/CanvasPath.js";
import { drawExtrudedConvexPolygon } from "./Props3D/SolidDraw.js";
import { fanTriangulateFromOrigin } from "../Math/Poly2D.js";
import { projectVertical, scaleAtHeight } from "../Spatial/iso/IsometricProjection.js";

function traceProjectedFootprintRing(ctx, projection, vertices, facing, atTop) {
    const { cx, cy, topX, topY, alpha } = projection;
    const cos = Math.cos(facing);
    const sin = Math.sin(facing);
    const originX = atTop ? topX : cx;
    const originY = atTop ? topY : cy;
    const ring = [];
    for (let i = 0; i < vertices.length; i++) {
        const lx = vertices[i].x;
        const ly = vertices[i].y;
        const sx = atTop ? scaleAtHeight(lx, alpha, 1) : lx;
        const sy = atTop ? scaleAtHeight(ly, alpha, 1) : ly;
        ring.push({ x: originX + sx * cos - sy * sin, y: originY + sx * sin + sy * cos });
    }
    ctx.beginPath();
    traceClosedPolygon(ctx, ring);
}

export function createGoalStarDraw(visuals) {
    const { colors, world, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        const height = world?.height ?? 3;
        const facing = prop.facing;
        const outlineWidth = lineWidth ?? 0.45;
        const fillOpts = {
            height,
            facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: colors.bottom ? { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow } : null,
            topColors: colors.bottom ? { light: colors.topHighlight ?? colors.top, mid: colors.top, dark: colors.side } : { light: colors.top, mid: colors.top, dark: colors.side },
            stroke: "transparent",
            lineWidth: 0,
        };
        const triangles = fanTriangulateFromOrigin(shape.vertices);
        for (let i = 0; i < triangles.length; i++) {
            drawExtrudedConvexPolygon(ctx, prop, px, py, { ...fillOpts, localVerts: triangles[i] });
        }
        const projection = projectVertical(prop.x, prop.y, px, py, height);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = outlineWidth;
        traceProjectedFootprintRing(ctx, projection, shape.vertices, facing, true);
        ctx.stroke();
    };
}
