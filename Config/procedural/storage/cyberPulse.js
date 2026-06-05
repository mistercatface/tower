export default {
    warp: { frequency: 0.003, amplitude: 5, octaves: 2, sampleOffset: [100, 100] },
    palette: { base: [0, 0, 0], floorBase: [0, 0, 0], wallBase: [2, 2, 2] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.001, octaves: 1, rgbDelta: [0, 0, 0] }, grain: { frequency: 0.1, octaves: 1, amplitude: 0.1 } },
        {
            type: "hexGrid",
            cellWorldSize: 32,
            groutWidth: 0.02,
            groutPeak: 20,
            groutTint: [0, 25, 15],
            bevelWidth: 0,
            highlightPeak: 0,
            shadowPeak: 0,
            cellVariation: 0,
            blendMode: "screen",
            opacity: 1
        },
        {
            type: "translate",
            x: 0,
            y: 0,
            coordinateMode: "evalAndWarped"
        },
        {
            type: "circuitTraces",
            coordinateSpace: "eval",
            gridSize: 64,
            lineWidth: 2.0,
            density: 0.85,
            diagDensity: 0.55,
            peak: 25,
            tint: [25, 0, 20],
            padEnabled: false,
            blendMode: "add",
            opacity: 1
        },
        { type: "filterHSV", hueShift: 0, saturation: 2.0, value: 1.5, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 45,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].groutPeak", startValue: 12, endValue: 24, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].x", startValue: 0, endValue: 32, easing: "linear" },
                    { targetPath: "motifs[2].y", startValue: 0, endValue: 32, easing: "linear" },
                    { targetPath: "motifs[3].peak", startValue: 18, endValue: 30, easing: "easeInOutSine" },
                    { targetPath: "motifs[4].hueShift", startValue: 0, endValue: 180, easing: "linear" }
                ]
            },
            {
                frames: 45,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].groutPeak", startValue: 24, endValue: 12, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].x", startValue: 32, endValue: 64, easing: "linear" },
                    { targetPath: "motifs[2].y", startValue: 32, endValue: 64, easing: "linear" },
                    { targetPath: "motifs[3].peak", startValue: 30, endValue: 18, easing: "easeInOutSine" },
                    { targetPath: "motifs[4].hueShift", startValue: 180, endValue: 360, easing: "linear" }
                ]
            }
        ]
    }
};
