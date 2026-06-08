import { drawBox } from "../../Render/Props3D/SolidDraw.js";
/** @param {object} visuals */
export function createBoxPrimitive(visuals) {
    const { colors, world, plankTs, topCross, lineWidth } = visuals;
    return (ctx, prop, px, py) => {
        const opacity = prop.opacity ?? 1.0;
        const halfSize = prop.halfExtents ?? prop.radius ?? 8;
        const height = world?.height ?? 10;
        if (opacity < 1.0) {
            ctx.save();
            ctx.globalAlpha = opacity;
        }
        drawBox(ctx, prop, px, py, {
            halfSize,
            height,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
            topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            lineWidth: lineWidth ?? 1.0,
            plankTs,
            topCross,
        });
        if (opacity < 1.0) ctx.restore();
    };
}
