import { drawExtrudedConvexPolygon, drawExtrudedPoxelMesh } from "../../Render/Props3D/SolidDraw.js";
export function createPolygonPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const shape = prop.shape ?? prop.getShape?.();
        if (shape?.type !== "Polygon") return;
        const height = world?.height ?? 12;
        const drawOpts = {
            localVerts: shape.vertices,
            height,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: colors.bottom ? { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow } : null,
            topColors: colors.bottom ? { light: "#BCAAA4", mid: colors.top, dark: colors.side } : { light: colors.top, mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            lineWidth: lineWidth ?? 1.0,
            plankTs,
            topCross,
        };
        if (prop.poxels?.length) drawExtrudedPoxelMesh(ctx, prop, px, py, drawOpts);
        else drawExtrudedConvexPolygon(ctx, prop, px, py, drawOpts);
    };
}
