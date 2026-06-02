export default {
    warp: { frequency: 0.008, amplitude: 0.5, octaves: 2, sampleOffset: [0, 0] },
    palette: {
        base: [10, 15, 25],
        floorBase: [5, 10, 15],
        wallBase: [15, 20, 35],
    },
    motifs: [
        {
            type: "solidColor",
            surfaceMask: "all",
            blendMode: "replace",
            opacity: 1,
            color: [5, 10, 15]
        },
        {
            type: "circuitLines",
            surfaceMask: "floor",
            blendMode: "add",
            opacity: 0.8,
            lineWidth: 0.02,
            density: 5,
            hueShift: 180,
            brightness: 1.5
        },
        {
            type: "translate",
            surfaceMask: "all",
            blendMode: "normal",
            opacity: 1,
            xOffset: 0,
            yOffset: 0
        },
        {
            type: "hexGrid",
            surfaceMask: "wall",
            blendMode: "add",
            opacity: 0.6,
            scale: 4,
            edgeThickness: 0.05,
            hueShift: 300,
            brightness: 2.0
        }
    ],
    animation: {
        enabled: true,
        stages: [
            {
                durationMs: 2000,
                frames: 60,
                tracks: [
                    {
                        targetPath: "motifs[1].hueShift", // Circuit lines
                        startValue: 180,
                        endValue: 240,
                        easing: "ease-in"
                    },
                    {
                        targetPath: "motifs[2].yOffset", // Translate Y
                        startValue: 0,
                        endValue: 1,
                        easing: "ease-in-out"
                    },
                    {
                        targetPath: "motifs[3].hueShift", // Hex grid
                        startValue: 300,
                        endValue: 360,
                        easing: "linear"
                    }
                ]
            },
            {
                durationMs: 2000,
                frames: 60,
                tracks: [
                    {
                        targetPath: "motifs[1].hueShift", // Circuit lines
                        startValue: 240,
                        endValue: 180,
                        easing: "ease-out"
                    },
                    {
                        targetPath: "motifs[2].yOffset", // Translate Y
                        startValue: 1,
                        endValue: 0,
                        easing: "ease-in-out"
                    },
                    {
                        targetPath: "motifs[3].hueShift", // Hex grid
                        startValue: 360,
                        endValue: 300,
                        easing: "linear"
                    }
                ]
            }
        ]
    }
};
