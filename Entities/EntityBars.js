import { ProgressBar } from "../Render/ProgressBar.js";

export function createEntityBars({
    healthWidth,
    healthHeight,
    healthBorderRadius,
    chargeWidth = healthWidth,
    chargeHeight = 2,
    chargeBorderRadius = 1,
}) {
    return {
        healthBar: new ProgressBar({
            width: healthWidth,
            height: healthHeight,
            borderRadius: healthBorderRadius,
            quantizationSteps: 20,
        }),
        chargeBar: new ProgressBar({
            width: chargeWidth,
            height: chargeHeight,
            borderRadius: chargeBorderRadius,
            quantizationSteps: 20,
            colorFn: () => "#00E5FF",
        }),
    };
}
