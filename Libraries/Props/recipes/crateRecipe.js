import { drawExtrudedBox } from "../../Render/Props3D/SolidDraw.js";
/** @param {object} visuals */
export function createCrateDraw(visuals) {
    const { colors, world } = visuals;
    return (ctx, prop, px, py) => {
        const halfSize = prop.radius || 8;
        drawExtrudedBox(ctx, prop, px, py, {
            halfSize,
            height: world.height,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
            topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
            topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
        });
    };
}
/** @param {object} visuals */
export function createCrateShardDraw(visuals) {
    const { colors, world } = visuals;
    return (ctx, prop, px, py) => {
        const opacity = prop.opacity ?? 1.0;
        const halfExtents = prop.halfExtents ?? { x: 4, y: 4 };
        ctx.save();
        ctx.globalAlpha = opacity;
        drawExtrudedBox(ctx, prop, px, py, {
            halfSize: halfExtents,
            height: world.height * 0.6,
            facing: prop.facing,
            faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
            backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
            bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
            topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
            stroke: colors.stroke,
            lineWidth: 0.8,
        });
        ctx.restore();
    };
}
