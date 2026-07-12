import { BLEND_MODE_ADD, COORD_SPACE_WARPED } from "../../../Core/engineEnums.js";
import { sampleCoordX, sampleCoordY, applyTint } from "../util/motifUtilities.js";
/**
 * Topographical contour lines based on noise. When warped, looks like terraced armor plating or holographic fingerprint ridges.
 */
export const topoContoursMotif = {
    metadata: {
        label: "Topo contours",
        defaults: { type: "topoContours", coordinateSpace: COORD_SPACE_WARPED, frequency: 0.015, octaves: 2, bands: 10, thickness: 0.15, peak: 8, tint: [0.2, 0.7, 1.2], blendMode: BLEND_MODE_ADD },
        fields: [
            { path: "frequency", label: "Frequency", min: 0.005, max: 0.05, step: 0.001 },
            { path: "bands", label: "Bands", min: 1, max: 30, step: 1 },
            { path: "thickness", label: "Thickness", min: 0.01, max: 0.5, step: 0.01 },
            { path: "peak", label: "Peak", min: 0, max: 20, step: 1 },
            { path: "tint.0", label: "Tint R", min: -5, max: 5, step: 0.1 },
            { path: "tint.1", label: "Tint G", min: -5, max: 5, step: 0.1 },
            { path: "tint.2", label: "Tint B", min: -5, max: 5, step: 0.1 },
        ]},
    apply(sf, si, rf, ro, config, noise) {
        const x = sampleCoordX(sf, config.coordinateSpace);
        const y = sampleCoordY(sf, config.coordinateSpace);
        const noiseVal = noise.sample2D(x * config.frequency + (config.offset?.[0] ?? 0), y * config.frequency + (config.offset?.[1] ?? 0), config.octaves ?? 2);
        const normalizedNoise = (noiseVal + 1) / 2; // ~0 to 1
        const bandPhase = normalizedNoise * config.bands;
        const distToBand = Math.abs(bandPhase - Math.round(bandPhase));
        const thickness = config.thickness ?? 0.1;
        if (distToBand < thickness) {
            const intensity = (1.0 - distToBand / thickness) * config.peak;
            applyTint(rf, ro, intensity, config.tint ?? [1, 1, 1]);
        }
    }};
