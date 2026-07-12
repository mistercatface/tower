import { BLEND_MODE_ADD, BLEND_MODE_REPLACE, COORD_SPACE_WARPED } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.007, amplitude: 18, octaves: 3, sampleOffset: [150, 450] },
    palette: { base: [10, 5, 25], floorBase: [6, 2, 16], wallBase: [18, 8, 35] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [2, 1, 4] }, grain: { frequency: 0.3, octaves: 2, amplitude: 0.5 } },
        {
            type: "starburst",
            coordinateSpace: COORD_SPACE_WARPED,
            gridSize: 64,
            density: 0.3,
            radius: 24,
            spikes: 6,
            peak: 15,
            tint: [1.2, 0.2, 1.5],
            blendMode: BLEND_MODE_ADD
        },
        {
            type: "concentricRings",
            coordinateSpace: COORD_SPACE_WARPED,
            frequency: 0.015,
            ringWidth: 0.12,
            peak: 8,
            offset: [0, 0],
            tint: [0.2, 0.8, 1.6],
            blendMode: BLEND_MODE_ADD
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.5, value: 1.1, blendMode: BLEND_MODE_REPLACE}
    ],
    animation: {
        stages: [
            {
                frames: 40,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].radius", startValue: 24, endValue: 36, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].spikes", startValue: 6, endValue: 12, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].frequency", startValue: 0.015, endValue: 0.035, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].ringWidth", startValue: 0.12, endValue: 0.06, easing: "easeInOutQuad" },
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 60, easing: "linear" }
                ]
            },
            {
                frames: 40,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].radius", startValue: 36, endValue: 24, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].spikes", startValue: 12, endValue: 6, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].frequency", startValue: 0.035, endValue: 0.015, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].ringWidth", startValue: 0.06, endValue: 0.12, easing: "easeInOutQuad" },
                    { targetPath: "motifs[3].hueShift", startValue: 60, endValue: 0, easing: "linear" }
                ]
            }
        ]
    }
};
