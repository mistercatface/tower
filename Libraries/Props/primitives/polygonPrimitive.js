import { drawExtrudedConvexPolygon } from "../../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";
import { resolveVisualOverrideColorTree } from "../../Color/visualOverride.js";
import { worldPropAssets } from "../PropCatalog.js";
export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, viewport) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        const tinted = resolveVisualOverrideColorTree(prop, colors);
        const height = prop.height ?? world?.height ?? 12;
        const asset = worldPropAssets[prop.type];
        let scale = 1.0;
        const footprint = prop.strategy?.localFootprint ?? asset?.physics?.localFootprint;
        if (footprint?.length) {
            let maxDist = 0;
            for (let i = 0; i < footprint.length; i++) maxDist = Math.max(maxDist, Math.hypot(footprint[i].x, footprint[i].y));
            if (maxDist > 0 && prop.radius) scale = prop.radius / maxDist;
        }
        const baseLineWidth = lineWidth ?? 1.0;
        const resolvedLineWidth = Math.max(0.35, baseLineWidth * scale);
        const drawOpts = {
            height,
            facing: prop.facing,
            faceColors: { shadow: tinted.sideShadow, mid: tinted.side, highlight: tinted.top },
            backFaceColors: { shadow: tinted.sideShadow, mid: tinted.sideShadow, highlight: tinted.side },
            bottomColors: tinted.bottom ? { light: tinted.sideShadow, mid: tinted.bottom, dark: tinted.sideShadow } : null,
            topColors: tinted.bottom ? { light: tinted.topHighlight ?? tinted.top, mid: tinted.top, dark: tinted.side } : { light: tinted.top, mid: tinted.top, dark: tinted.side },
            stroke: tinted.stroke,
            seamStroke: tinted.seamStroke,
            lineWidth: resolvedLineWidth,
            plankTs,
            topCross,
        };
        const parts = getEntityCollisionParts(prop);
        for (let i = 0; i < parts.length; i++) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[i].vertices });
    };
}
