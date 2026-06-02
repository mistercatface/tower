export default {
    warp: { frequency: 0.005, amplitude: 8, octaves: 2, sampleOffset: [100, 100] },
    palette: { base: [10, 10, 20], floorBase: [8, 8, 16], wallBase: [12, 12, 24] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.002, octaves: 2, rgbDelta: [2, 2, 4] }, grain: { frequency: 0.2, octaves: 1, amplitude: 0.5 } },
        {
            type: "hexGrid",
            cellWorldSize: 20,
            groutWidth: 0.08,
            groutPeak: 8,
            groutTint: [0, 4, 8],
            bevelWidth: 0.04,
            highlightPeak: 6,
            shadowPeak: -4,
            cellVariation: 1,
            blendMode: "add",
            opacity: 0.8
        },
        {
            type: "circuitTraces",
            coordinateSpace: "warped",
            gridSize: 24,
            lineWidth: 2.5,
            density: 0.6,
            diagDensity: 0.2,
            peak: 12,
            tint: [0.5, 4, 8],
            padEnabled: true,
            blendMode: "color-dodge",
            opacity: 1
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.5,
            value: 1.1,
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 35,
                durationMs: 2500,
                tracks: [
                    { targetPath: "motifs[2].gridSize", startValue: 12, endValue: 48, easing: "easeInOutQuad" },
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 360, easing: "linear" },
                ],
            },
        ],
    }
};
