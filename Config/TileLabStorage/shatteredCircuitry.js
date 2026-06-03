export default {
    warp: { frequency: 0.003, amplitude: 5, octaves: 2, sampleOffset: [200, 300] },
    palette: { base: [5, 10, 15], floorBase: [4, 8, 12], wallBase: [8, 15, 20] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 3, 4] }, grain: { frequency: 0.2, octaves: 1, amplitude: 0.3 } },
        {
            type: "circuitTraces",
            coordinateSpace: "eval",
            gridSize: 24,
            lineWidth: 2.0,
            density: 0.4,
            diagDensity: 0.1,
            peak: 5,
            tint: [0, 8, 12],
            padEnabled: true,
            blendMode: "screen",
            opacity: 1
        },
        {
            type: "fractalCracks",
            frequency: 0.015,
            octaves: 3,
            threshold: 0.8,
            peak: 0,
            tint: [15, 2, 5],
            blendMode: "add",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            // Stage 1: Overload (Circuits glow and thicken)
            {
                frames: 15,
                durationMs: 1500,
                tracks: [
                    { targetPath: "motifs[1].peak", startValue: 5, endValue: 25, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].lineWidth", startValue: 2.0, endValue: 3.5, easing: "easeInOutSine" }
                ]
            },
            // Stage 2: Shatter (Cracks appear, circuits die out)
            {
                frames: 15,
                durationMs: 1500,
                tracks: [
                    { targetPath: "motifs[2].threshold", startValue: 0.8, endValue: 0.4, easing: "easeOutQuad" },
                    { targetPath: "motifs[2].peak", startValue: 0, endValue: 25, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].opacity", startValue: 1.0, endValue: 0.4, easing: "easeOutQuad" }
                ]
            },
            // Stage 3: Un-Shatter (Cracks recede, circuits return)
            {
                frames: 15,
                durationMs: 1500,
                tracks: [
                    { targetPath: "motifs[2].threshold", startValue: 0.4, endValue: 0.8, easing: "easeInQuad" },
                    { targetPath: "motifs[2].peak", startValue: 25, endValue: 0, easing: "easeInQuad" },
                    { targetPath: "motifs[1].opacity", startValue: 0.4, endValue: 1.0, easing: "easeInQuad" }
                ]
            },
            // Stage 4: Cool down (Glow and thickness fade)
            {
                frames: 15,
                durationMs: 1500,
                tracks: [
                    { targetPath: "motifs[1].peak", startValue: 25, endValue: 5, easing: "easeInQuad" },
                    { targetPath: "motifs[1].lineWidth", startValue: 3.5, endValue: 2.0, easing: "easeInOutSine" }
                ]
            }
        ]
    }
};
