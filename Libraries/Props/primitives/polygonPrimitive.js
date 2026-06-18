import { drawExtrudedConvexPolygon } from "../../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";

export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        const height = world?.height ?? 12;
        const drawOpts = {
            height,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: colors.bottom ? { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow } : null,
            topColors: colors.bottom ? { light: colors.topHighlight ?? colors.top, mid: colors.top, dark: colors.side } : { light: colors.top, mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            seamStroke: colors.seamStroke,
            lineWidth: lineWidth ?? 1.0,
            plankTs,
            topCross,
        };
        const parts = getEntityCollisionParts(prop);
        for (let i = 0; i < parts.length; i++) drawExtrudedConvexPolygon(ctx, prop, px, py, { ...drawOpts, localVerts: parts[i].vertices });
    };
}
