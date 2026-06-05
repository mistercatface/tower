import { WOOD_CRATE } from "../../../../../../Config/content/props/Crate.js";
import { drawExtrudedBox } from "../../../../../../Libraries/Render/Props3D/SolidDraw.js";

export function drawCrateCombat(ctx, prop, px, py) {
    const { colors, combat } = WOOD_CRATE;
    const halfSize = prop.radius || 8;

    drawExtrudedBox(ctx, prop, px, py, {
        halfSize,
        height: combat.height,
        facing: prop.facing,
        faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
        backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
        bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
        topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
        stroke: colors.stroke,
        plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
        topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
    });
}

export function drawCrateShardCombat(ctx, prop, px, py) {
    const { colors, combat } = WOOD_CRATE;
    const opacity = prop.opacity ?? 1.0;

    ctx.save();
    ctx.globalAlpha = opacity;

    const halfExtents = prop.halfExtents ?? { x: 4, y: 4 };

    drawExtrudedBox(ctx, prop, px, py, {
        halfSize: halfExtents,
        height: combat.height * 0.6,
        facing: prop.facing,
        faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
        backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
        bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
        topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
        stroke: colors.stroke,
        lineWidth: 0.8,
    });

    ctx.restore();
}
