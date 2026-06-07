import { ProgressBar } from "../../../Libraries/Canvas/ProgressBar.js";
export function createEntityBars({ healthWidth, healthHeight, healthBorderRadius, stunWidth, stunHeight, stunBorderRadius }) {
    return {
        healthBar: new ProgressBar({ width: healthWidth, height: healthHeight, borderRadius: healthBorderRadius, quantizationSteps: 20 }),
        stunBar: new ProgressBar({ width: stunWidth ?? healthWidth, height: stunHeight ?? 2, borderRadius: stunBorderRadius ?? 1, quantizationSteps: 30, colorFn: () => "#B388FF" }),
    };
}
