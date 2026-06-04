export default {
    warp: { frequency: 0.005, amplitude: 10, octaves: 2, sampleOffset: [120, 240] },
    palette: { base: [12, 16, 10], floorBase: [4, 8, 4], wallBase: [8, 4, 4] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [1, 2, 1] }, grain: { frequency: 0.3, octaves: 2, amplitude: 0.5 } },
        {
            type: "deckPlates",
            surfaceMask: "floor",
            cellWorldSize: 32,
            plateCells: 2,
            plateRows: 2,
            groutWidth: 0.04,
            groutPeak: 8,
            groutTint: [-5, -6, -5],
            plateVariation: 4,
            jitterOffset: [0, 0],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.015,
            rivetPeak: 6,
            rivetTint: [0.8, 1.2, 0.8],
            blendMode: "multiply",
            opacity: 0.85
        },
        {
            type: "voronoiCell",
            surfaceMask: "all",
            coordinateSpace: "warped",
            density: 0.04,
            edgeWidth: 0.08,
            peak: 10,
            tint: [0.2, 0.8, 0.3],
            blendMode: "add",
            opacity: 0.6
        },
        {
            type: "wallHorizontalBevel",
            surfaceMask: "wall",
            bands: 4,
            ribFill: 0.5,
            highlightPeak: 8,
            shadowPeak: 12,
            coreWidth: 0.15,
            corePeak: 16,
            coreTint: [2.5, 0.2, 0.3],
            blendMode: "add",
            opacity: 0.9
        },
        {
            type: "circuitTraces",
            surfaceMask: "all",
            coordinateSpace: "warped",
            gridSize: 32,
            lineWidth: 2,
            density: 0.45,
            diagDensity: 0.1,
            peak: 24,
            tint: [2.4, 0.3, 0.4],
            padEnabled: true,
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "wallLighting",
            surfaceMask: "wall",
            power: 1.4,
            topDarken: 20,
            coolBias: 1.05,
            blendMode: "multiply",
            opacity: 1
        },
        { type: "filterHSV", surfaceMask: "all", hueShift: 0, saturation: 1.6, value: 0.95, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 20,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[4].gridSize", startValue: 24, endValue: 40, easing: "easeInOutQuad" },
                    { targetPath: "motifs[6].hueShift", startValue: -15, endValue: 15, easing: "linear" }
                ]
            },
            {
                frames: 20,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[4].gridSize", startValue: 40, endValue: 24, easing: "easeInOutQuad" },
                    { targetPath: "motifs[6].hueShift", startValue: 15, endValue: -15, easing: "linear" }
                ]
            }
        ]
    }
};
