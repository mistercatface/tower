import { drawJackoFuelBarrelCombat } from "./props/jacko/Combat.js";
import { drawExtrudedBox } from "./SolidDraw.js";

export function drawBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: false });
}

export function drawFireBarrel(ctx, pc) {
    drawJackoFuelBarrelCombat(ctx, pc, { onFire: true });
}

export function drawCrate(ctx, pc) {
    const halfSize = pc.prop.radius || 8;
    drawExtrudedBox(ctx, pc, {
        halfSize,
        faceColors: { shadow: "#4E342E", mid: "#8D6E63", highlight: "#A1887F" },
        topColors: { light: "#BCAAA4", mid: "#A1887F", dark: "#8D6E63" },
        stroke: "#3E2723",
        plankTs: { values: [0.33, 0.66], stroke: "rgba(62, 39, 35, 0.55)" },
        topCross: { stroke: "rgba(62, 39, 35, 0.6)" },
    });
}
