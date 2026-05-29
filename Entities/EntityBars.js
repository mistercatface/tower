import { ProgressBar } from "../Render/ProgressBar.js";

export function createEntityBars({
    healthWidth,
    healthHeight,
    healthBorderRadius,
    reloadWidth = healthWidth,
    reloadHeight = 2,
    reloadBorderRadius = 1,
}) {
    return {
        healthBar: new ProgressBar({
            width: healthWidth,
            height: healthHeight,
            borderRadius: healthBorderRadius,
            quantizationSteps: 20,
        }),
        reloadBar: new ProgressBar({
            width: reloadWidth,
            height: reloadHeight,
            borderRadius: reloadBorderRadius,
            quantizationSteps: 20,
            colorFn: () => "#FFC107",
        }),
    };
}
