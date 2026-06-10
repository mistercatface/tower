export default {
    warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [200, 200] },
    palette: { base: [14, 10, 8], floorBase: [10, 8, 6], wallBase: [4, 4, 4] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.006, octaves: 3, rgbDelta: [3, 2, 1] }, grain: { frequency: 0.4, octaves: 2, amplitude: 0.8 }, surfaceMask: "all", blendMode: "add" },
        { type: "filterLevels", blackPoint: 0, whitePoint: 255, gamma: 1, blendMode: "add", surfaceMask: "all" },
        {
            type: "circuitTraces",
            surfaceMask: "all",
            coordinateSpace: "warped",
            gridSize: 32,
            lineWidth: 1.5,
            density: 0.45,
            diagDensity: 0.2,
            peak: 25,
            tint: [2.2, 0.8, 0.2],
            padEnabled: true,
            blendMode: "add",
        },
        { type: "filterHSV", surfaceMask: "all", hueShift: 103, saturation: 3, value: 0.85, blendMode: "replace" },
    ],
    animation: {
        stages: [
            { frames: 30, durationMs: 600, tracks: [{ targetPath: "motifs[2].angle", startValue: -360, endValue: -291, easing: "easeInQuad" }] },
            { frames: 30, durationMs: 600, tracks: [{ targetPath: "motifs[2].angle", startValue: -291, endValue: -360, easing: "easeOutQuad" }] },
        ],
    },
};
