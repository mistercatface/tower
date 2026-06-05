export default {
    warp: { frequency: 0.004, amplitude: 12, octaves: 2, sampleOffset: [200, 50] },
    palette: { base: [6, 12, 22], floorBase: [4, 10, 18], wallBase: [10, 18, 32] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [1, 2, 5] }, grain: { frequency: 0.25, octaves: 1, amplitude: 0.4 } },
        {
            type: "concentricRings",
            coordinateSpace: "warped",
            frequency: 0.02,
            ringWidth: 0.08,
            peak: 10,
            offset: [0, 0],
            tint: [0.2, 0.9, 1.4],
            blendMode: "add",
            opacity: 0.75
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.4, value: 1.1, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 45,
                durationMs: 3200,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.02, endValue: 0.06, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].ringWidth", startValue: 0.08, endValue: 0.18, easing: "easeInOutQuad" },
                    { targetPath: "motifs[1].peak", startValue: 10, endValue: 17, easing: "easeOutCubic" },
                    { targetPath: "motifs[2].hueShift", startValue: 0, endValue: 55, easing: "linear" },
                    { targetPath: "motifs[2].value", startValue: 1.1, endValue: 1.3, easing: "easeOutSine" }
                ]
            },
            {
                frames: 45,
                durationMs: 3200,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.06, endValue: 0.02, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].ringWidth", startValue: 0.18, endValue: 0.08, easing: "easeInOutQuad" },
                    { targetPath: "motifs[1].peak", startValue: 17, endValue: 10, easing: "easeInCubic" },
                    { targetPath: "motifs[2].hueShift", startValue: 55, endValue: 0, easing: "linear" },
                    { targetPath: "motifs[2].value", startValue: 1.3, endValue: 1.1, easing: "easeInSine" }
                ]
            }
        ]
    }
};
