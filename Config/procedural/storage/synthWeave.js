import { BLEND_MODE_COLOR_DODGE, BLEND_MODE_REPLACE, COORD_SPACE_WARPED } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.007, amplitude: 18, octaves: 3, sampleOffset: [80, 400] },
    palette: { base: [4, 14, 18], floorBase: [3, 11, 15], wallBase: [8, 22, 28] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.002, octaves: 2, rgbDelta: [1, 4, 5] }, grain: { frequency: 0.2, octaves: 1, amplitude: 0.35 } },
        {
            type: "celticWeave",
            coordinateSpace: COORD_SPACE_WARPED,
            gridSize: 32,
            pipeWidth: 4,
            peak: 10,
            tint: [0.3, 1.1, 1.3],
            blendMode: BLEND_MODE_COLOR_DODGE
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.4, value: 1.2, blendMode: BLEND_MODE_REPLACE}
    ],
    animation: {
        stages: [
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].gridSize", startValue: 20, endValue: 52, easing: "easeInOutExpo" },
                    { targetPath: "motifs[1].pipeWidth", startValue: 2.5, endValue: 9, easing: "easeOutQuint" },
                    { targetPath: "motifs[1].peak", startValue: 6, endValue: 16, easing: "easeInOutCubic" },
                    { targetPath: "motifs[2].hueShift", startValue: -20, endValue: 30, easing: "linear" },
                    { targetPath: "motifs[2].saturation", startValue: 1.4, endValue: 1.85, easing: "easeOutSine" }
                ]
            },
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].gridSize", startValue: 52, endValue: 20, easing: "easeInOutExpo" },
                    { targetPath: "motifs[1].pipeWidth", startValue: 9, endValue: 2.5, easing: "easeInQuint" },
                    { targetPath: "motifs[1].peak", startValue: 16, endValue: 6, easing: "easeInOutCubic" },
                    { targetPath: "motifs[2].hueShift", startValue: 30, endValue: -20, easing: "linear" },
                    { targetPath: "motifs[2].saturation", startValue: 1.85, endValue: 1.4, easing: "easeInSine" }
                ]
            }
        ]
    }
};
