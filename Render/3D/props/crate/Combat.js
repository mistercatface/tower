import { WOOD_CRATE } from "../../../../Config/props/Crate.js";
import { drawExtrudedBox } from "../../draw/SolidDraw.js";

export function drawCrateCombat(ctx, pc) {
    const { colors, combat } = WOOD_CRATE;
    const halfSize = pc.prop.radius || 8;

    drawExtrudedBox(ctx, pc, {
        halfSize,
        height: combat.height,
        facing: pc.facing,
        faceColors: { shadow: colors.sideShadow, mid: colors.side, highlight: colors.top },
        backFaceColors: { shadow: colors.sideShadow, mid: colors.sideShadow, highlight: colors.side },
        bottomColors: { light: colors.sideShadow, mid: colors.bottom, dark: colors.sideShadow },
        topColors: { light: "#BCAAA4", mid: colors.top, dark: colors.side },
        stroke: colors.stroke,
        plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
        topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
    });
}
