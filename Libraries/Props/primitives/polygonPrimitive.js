import { drawExtrudedConvexPolygon } from "../../Render/Props3D/SolidDraw.js";
export function createPolygonPrimitive(visuals) {
    const { colors, world, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        drawExtrudedConvexPolygon(ctx, prop, px, py, {
            localVerts: shape.vertices,
            height: world?.height ?? 12,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            topColors: { light: colors.top, mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            lineWidth: lineWidth ?? 1.0,
        });
    };
}
