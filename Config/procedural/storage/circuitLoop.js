export default {
    warp: { frequency: 0.005, amplitude: 2, octaves: 1, sampleOffset: [0, 0] },
    palette: { base: [10, 10, 12], floorBase: [8, 8, 10], wallBase: [6, 6, 8] },
    motifs: [
        {
            type: "baseMetal",
            structure: { frequency: 0.008, octaves: 2, rgbDelta: [2, 2, 2] },
            grain: { frequency: 0.5, octaves: 1, amplitude: 0.5 }
        },
        {
            type: "circuitTraces",
            surfaceMask: "all",
            coordinateSpace: "eval",
            gridSize: 32,
            lineWidth: 2,
            density: 0.6,
            diagDensity: 0.3,
            peak: 25,
            angle: 0,
            tint: [0.0, 2.5, 3.0], // Neon cyan/blue circuitry
            padEnabled: true,
            blendMode: "add",
            opacity: 0.9
        },
        {
            type: "filterHSV",
            surfaceMask: "all",
            hueShift: 0,
            saturation: 1.2,
            value: 0.9,
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 60,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[1].angle", startValue: 0, endValue: 360, easing: "linear" }
                ]
            }
        ]
    }
};
