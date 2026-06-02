export default {
    warp: { frequency: 0.005, amplitude: 16, octaves: 2, sampleOffset: [600, 200] },
    palette: { base: [8, 6, 20], floorBase: [6, 5, 16], wallBase: [14, 10, 34] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [2, 1, 6] }, grain: { frequency: 0.15, octaves: 1, amplitude: 0.3 } },
        {
            type: "topoContours",
            coordinateSpace: "warped",
            frequency: 0.015,
            octaves: 2,
            bands: 10,
            thickness: 0.15,
            peak: 8,
            tint: [0.3, 0.8, 1.5],
            blendMode: "add",
            opacity: 0.55
        },
        {
            type: "starburst",
            coordinateSpace: "warped",
            gridSize: 64,
            density: 0.2,
            radius: 22,
            spikes: 6,
            peak: 10,
            tint: [1.4, 0.4, 1.8],
            blendMode: "screen",
            opacity: 0.8
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.7, value: 1.15, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 48,
                durationMs: 3400,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.015, endValue: 0.028, easing: "easeInOutCubic" },
                    { targetPath: "motifs[1].bands", startValue: 10, endValue: 18, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].peak", startValue: 8, endValue: 14, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].density", startValue: 0.2, endValue: 0.45, easing: "easeOutCubic" },
                    { targetPath: "motifs[2].radius", startValue: 22, endValue: 40, easing: "easeOutSine" },
                    { targetPath: "motifs[2].spikes", startValue: 6, endValue: 12, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].peak", startValue: 10, endValue: 18, easing: "easeOutQuint" },
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 50, easing: "linear" },
                    { targetPath: "motifs[3].value", startValue: 1.15, endValue: 1.35, easing: "easeOutSine" }
                ]
            },
            {
                frames: 48,
                durationMs: 3400,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.028, endValue: 0.015, easing: "easeInOutCubic" },
                    { targetPath: "motifs[1].bands", startValue: 18, endValue: 10, easing: "easeInQuad" },
                    { targetPath: "motifs[1].peak", startValue: 14, endValue: 8, easing: "easeInOutSine" },
                    { targetPath: "motifs[2].density", startValue: 0.45, endValue: 0.2, easing: "easeInCubic" },
                    { targetPath: "motifs[2].radius", startValue: 40, endValue: 22, easing: "easeInSine" },
                    { targetPath: "motifs[2].spikes", startValue: 12, endValue: 6, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].peak", startValue: 18, endValue: 10, easing: "easeInQuint" },
                    { targetPath: "motifs[3].hueShift", startValue: 50, endValue: 0, easing: "linear" },
                    { targetPath: "motifs[3].value", startValue: 1.35, endValue: 1.15, easing: "easeInSine" }
                ]
            }
        ]
    }
};
