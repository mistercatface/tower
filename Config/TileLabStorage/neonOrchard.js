export default {
    warp: { frequency: 0.006, amplitude: 8, octaves: 2, sampleOffset: [200, 100] },
    palette: { base: [4, 8, 24], floorBase: [2, 3, 12], wallBase: [4, 6, 18] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [1, 1, 3] }, grain: { frequency: 0.4, octaves: 1, amplitude: 0.4 } },
        {
            type: "hexGrid",
            surfaceMask: "floor",
            cellWorldSize: 48,
            groutWidth: 0.06,
            groutPeak: 10,
            groutTint: [-10, -10, -5],
            bevelWidth: 0.03,
            highlightPeak: 6,
            shadowPeak: -4,
            cellVariation: 1,
            blendMode: "multiply",
            opacity: 0.9
        },
        {
            type: "concentricRings",
            surfaceMask: "floor",
            coordinateSpace: "warped",
            frequency: 0.025,
            ringWidth: 0.08,
            peak: 18,
            tint: [0.1, 0.5, 2.5],
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "wallHorizontalBevel",
            surfaceMask: "wall",
            bands: 5,
            ribFill: 0.6,
            highlightPeak: 6,
            shadowPeak: 10,
            coreWidth: 0.2,
            corePeak: 20,
            coreTint: [2.2, 2.0, 0.2],
            blendMode: "add",
            opacity: 0.9
        },
        {
            type: "starburst",
            surfaceMask: "all",
            coordinateSpace: "warped",
            gridSize: 64,
            density: 0.25,
            radius: 20,
            spikes: 8,
            peak: 24,
            tint: [2.0, 1.8, 0.2],
            blendMode: "screen",
            opacity: 0.8
        },
        {
            type: "wallLighting",
            surfaceMask: "wall",
            power: 1.3,
            topDarken: 24,
            coolBias: 1.08,
            blendMode: "multiply",
            opacity: 1
        },
        { type: "filterHSV", surfaceMask: "all", hueShift: 0, saturation: 1.7, value: 1.0, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 25,
                durationMs: 3500,
                tracks: [
                    { targetPath: "motifs[2].frequency", startValue: 0.02, endValue: 0.04, easing: "easeInOutSine" },
                    { targetPath: "motifs[6].hueShift", startValue: 0, endValue: 40, easing: "linear" }
                ]
            },
            {
                frames: 25,
                durationMs: 3500,
                tracks: [
                    { targetPath: "motifs[2].frequency", startValue: 0.04, endValue: 0.02, easing: "easeInOutSine" },
                    { targetPath: "motifs[6].hueShift", startValue: 40, endValue: 0, easing: "linear" }
                ]
            }
        ]
    }
};
