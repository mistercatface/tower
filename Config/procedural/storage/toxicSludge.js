import { BLEND_MODE_ADD, BLEND_MODE_REPLACE, COORD_SPACE_WARPED } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.008, amplitude: 20, octaves: 3, sampleOffset: [500, 500] },
    palette: { base: [10, 25, 5], floorBase: [5, 15, 2], wallBase: [15, 30, 8] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 3, rgbDelta: [2, 8, 2] }, grain: { frequency: 0.5, octaves: 2, amplitude: 1.0 } },
        { type: "voronoiCell", coordinateSpace: COORD_SPACE_WARPED, density: 0.08, edgeWidth: 0.1, peak: 15, tint: [2, 8, 1], blendMode: BLEND_MODE_ADD},
        { type: "filterHSV", hueShift: 0, saturation: 1.5, value: 0.9, blendMode: BLEND_MODE_REPLACE}
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[1].density", startValue: 0.06, endValue: 0.1, easing: "linear" },
                    { targetPath: "motifs[2].hueShift", startValue: -20, endValue: 20, easing: "linear" },
                ]},
        ]}
};
