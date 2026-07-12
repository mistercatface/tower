import { BLEND_MODE_SCREEN, BLEND_MODE_ADD, BLEND_MODE_REPLACE, COORD_SPACE_EVAL } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.0, amplitude: 0, octaves: 1, sampleOffset: [0, 0] },
    palette: { base: [0, 0, 0], floorBase: [0, 0, 0], wallBase: [2, 2, 2] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.001, octaves: 1, rgbDelta: [0, 0, 0] }, grain: { frequency: 0.1, octaves: 1, amplitude: 0.1 } },
        { type: "hexGrid", cellWorldSize: 32, groutWidth: 0.02, groutPeak: 20, groutTint: [0, 25, 15], bevelWidth: 0, highlightPeak: 0, shadowPeak: 0, cellVariation: 0, blendMode: BLEND_MODE_SCREEN},
        { type: "circuitTraces", coordinateSpace: COORD_SPACE_EVAL, gridSize: 64, lineWidth: 2.0, density: 0.8, diagDensity: 0.5, peak: 25, tint: [25, 0, 20], padEnabled: false, blendMode: BLEND_MODE_ADD},
        { type: "filterHSV", hueShift: 0, saturation: 2.0, value: 1.5, blendMode: BLEND_MODE_REPLACE}
    ],
    animation: {
        stages: [
            {
                frames: 90,
                durationMs: 6000,
                tracks: [
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 360, easing: "linear" },
                ]},
        ]}
};
