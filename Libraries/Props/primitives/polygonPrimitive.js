import { drawExtrudedConvexPolygon } from "../../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";
import { resolvePropTintedColorTree } from "../propTint.js";

export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        const tinted = resolvePropTintedColorTree(prop, colors);
        const height = world?.height ?? 12;
        const drawOpts = {
            height,
            facing: prop.facing,
            faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
            backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
            bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
            topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
            stroke: tinted.stroke,
            seamStroke: tinted.seamStroke,
            lineWidth: lineWidth ?? 1.0,
            plankTs,
            topCross,
        };
        const parts = getEntityCollisionParts(prop);
        for (let i = 0; i < parts.length; i++) drawExtrudedConvexPolygon(ctx, prop, px, py, { ...drawOpts, localVerts: parts[i].vertices });
    };
}
