export default {
    warp: { frequency: 0.006, amplitude: 14, octaves: 2, sampleOffset: [300, 120] },
    palette: { base: [18, 8, 4], floorBase: [14, 6, 3], wallBase: [28, 12, 6] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [6, 2, 1] }, grain: { frequency: 0.35, octaves: 2, amplitude: 0.6 } },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.016,
            octaves: 2,
            angle: 0.15,
            ridgeThreshold: 0.11,
            peak: 10,
            intersectionPeak: 12,
            tint: [0.5, 0.3, 0.2],
            intersectionTint: [1.2, 0.6, 0.3],
            blendMode: "add",
            opacity: 0.65
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.6, value: 1.05, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 5,
                durationMs: 3200,
                tracks: [
                    { targetPath: "motifs[1].ridgeThreshold", startValue: 0.11, endValue: 0.06, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].peak", startValue: 10, endValue: 17, easing: "easeOutCubic" },
                    { targetPath: "motifs[1].intersectionPeak", startValue: 12, endValue: 20, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].angle", startValue: 0.15, endValue: 0.45, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].hueShift", startValue: 0, endValue: 35, easing: "linear" }
                ]
            },
            {
                frames: 5,
                durationMs: 3200,
                tracks: [
                    { targetPath: "motifs[1].ridgeThreshold", startValue: 0.06, endValue: 0.15, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].peak", startValue: 17, endValue: 7, easing: "easeInQuad" },
                    { targetPath: "motifs[1].intersectionPeak", startValue: 20, endValue: 9, easing: "easeOutSine" },
                    { targetPath: "motifs[1].angle", startValue: 0.45, endValue: 0.05, easing: "easeOutCubic" },
                    { targetPath: "motifs[2].hueShift", startValue: 35, endValue: 70, easing: "linear" }
                ]
            },
            {
                frames: 5,
                durationMs: 3200,
                tracks: [
                    { targetPath: "motifs[1].ridgeThreshold", startValue: 0.15, endValue: 0.11, easing: "easeInQuad" },
                    { targetPath: "motifs[1].peak", startValue: 7, endValue: 10, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].intersectionPeak", startValue: 9, endValue: 12, easing: "easeInSine" },
                    { targetPath: "motifs[1].angle", startValue: 0.05, endValue: 0.15, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].hueShift", startValue: 70, endValue: 0, easing: "linear" }
                ]
            }
        ]
    }
};
