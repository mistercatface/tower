import { BLEND_MODE_ADD } from "../../../Core/engineEnums.js";
import { SF_EVAL_X, SF_EVAL_Y, applyTint } from "../util/motifUtilities.js";
export const surfaceGrainMotif = {
    metadata: {
        label: "Surface grain",
        defaults: { type: "surfaceGrain", frequency: 0.05, axis: "none", axisStretch: 0.25, octaves: 1, amplitude: 1.0, tint: [1, 1, 1], blendMode: BLEND_MODE_ADD },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.5, step: 0.005 },
            { path: "axis", label: "Stretch Axis", options: ["none", "horizontal", "vertical"] },
            { path: "axisStretch", label: "Stretch factor", min: 0.05, max: 1.0, step: 0.05 },
            { path: "octaves", label: "Octaves", min: 1, max: 4, step: 1 },
            { path: "amplitude", label: "Amplitude", min: 0, max: 10, step: 0.5 },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        const freq = config.frequency;
        let nx = sf[SF_EVAL_X];
        let ny = sf[SF_EVAL_Y];
        if (config.axis === "horizontal") ny *= config.axisStretch ?? 0.25;
        else if (config.axis === "vertical") nx *= config.axisStretch ?? 0.25;
        const grain = noise.sample2D(nx * freq, ny * freq, config.octaves ?? 1) * config.amplitude;
        applyTint(rf, ro, grain, config.tint);
    }};
