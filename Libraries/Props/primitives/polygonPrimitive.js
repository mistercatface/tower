import { drawExtrudedConvexPolygon, drawExtrudedCompoundPolygon } from "../../Render/Props3D/SolidDraw.js";
import { getEntityCollisionParts } from "../../Spatial/collision/SatCollision.js";
import { resolveVisualOverrideColorTree } from "../../Color/visualOverride.js";
import propCatalog from "../../../Assets/props/index.js";
export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, viewport) => {
        const shape = prop.shape;
        if (shape?.type !== "Polygon") return;
        const tinted = resolveVisualOverrideColorTree(prop, colors);
        const height = prop.height ?? world?.height ?? 12;
        const asset = propCatalog[prop.type];
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
        if (parts.length > 1) drawExtrudedCompoundPolygon(ctx, prop, viewport, { ...drawOpts, partsVerts: parts.map((p) => p.vertices) });
        else if (parts.length === 1) drawExtrudedConvexPolygon(ctx, prop, viewport, { ...drawOpts, localVerts: parts[0].vertices });
    };
}
