import { ProgressBar } from "../Render/ProgressBar.js";

export function createEntityBars({
    healthWidth,
    healthHeight,
    healthBorderRadius,
}) {
    return {
        healthBar: new ProgressBar({
            width: healthWidth,
            height: healthHeight,
            borderRadius: healthBorderRadius,
            quantizationSteps: 20,
        }),
    };
}
