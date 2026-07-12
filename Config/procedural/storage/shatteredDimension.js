import { BLEND_MODE_SCREEN, BLEND_MODE_REPLACE } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.005, amplitude: 10, octaves: 2, sampleOffset: [500, 100] },
    palette: { base: [10, 5, 20], floorBase: [8, 4, 15], wallBase: [15, 8, 30] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 1, 4] }, grain: { frequency: 0.3, octaves: 1, amplitude: 0.5 } },
        {
            type: "fractalCracks",
            frequency: 0.01,
            octaves: 4,
            threshold: 0.6,
            peak: 18,
            tint: [5, 1, 8],
            blendMode: BLEND_MODE_SCREEN
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.5, value: 1.2, blendMode: BLEND_MODE_REPLACE}
    ],
    animation: {
        stages: [
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].threshold", startValue: 0.7, endValue: 0.4, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].peak", startValue: 10, endValue: 25, easing: "easeOutQuad" },
                    { targetPath: "motifs[2].hueShift", startValue: 0, endValue: 60, easing: "linear" }
                ]
            },
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].threshold", startValue: 0.4, endValue: 0.7, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].peak", startValue: 25, endValue: 10, easing: "easeInQuad" },
                    { targetPath: "motifs[2].hueShift", startValue: 60, endValue: 0, easing: "linear" }
                ]
            }
        ]
    }
};
