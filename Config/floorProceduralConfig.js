const ancientRuins = {
    warp: { frequency: 0.002, amplitude: 5, octaves: 2, sampleOffset: [200, 900] },
    palette: { base: [30, 26, 22], floorBase: [20, 22, 26], wallBase: [24, 26, 30] },
    motifs: [
        {
            type: "baseMetal",
            structure: { frequency: 0.02, octaves: 4, rgbDelta: [7, 8, 8] },
            grain: { frequency: 1.65, octaves: 1, amplitude: 0.5 },
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1,
        },
        {
            type: "hexGrid",
            cellWorldSize: 24,
            groutWidth: 0.1,
            groutPeak: 15,
            groutTint: [2.2, 1, 0.2],
            bevelWidth: 0.05,
            highlightPeak: 5,
            shadowPeak: -4,
            bevelTint: [1, 1, 1],
            bevelCurve: "linear",
            bevelFalloff: 0.3,
            cellVariation: 3,
            surfaceMask: "all",
            blendMode: "color-dodge",
            opacity: 0.95,
        },
        {
            type: "circuitTraces",
            coordinateSpace: "warped",
            gridSize: 52,
            lineWidth: 6.5,
            density: 0.45,
            diagDensity: 0.1,
            peak: 18,
            tint: [4, 4.7, 1.1],
            padEnabled: true,
            surfaceMask: "all",
            blendMode: "color-dodge",
            opacity: 1,
        },
        { type: "filterHSV", hueShift: -180, saturation: 2.6, value: 0.1, surfaceMask: "all", blendMode: "add", opacity: 1 },
        { type: "fractalCracks", frequency: 0.012, octaves: 4, threshold: 0.43, peak: 15, tint: [0.4, -4.3, -4.9], surfaceMask: "all", blendMode: "hard-light", opacity: 0.95 },
        { type: "celticWeave", coordinateSpace: "warped", gridSize: 48, pipeWidth: 6, peak: 5, tint: [0.4, 0.3, 0.2], surfaceMask: "all", blendMode: "add", opacity: 0.5 },
        { type: "filterLevels", blackPoint: 49, whitePoint: 255, gamma: 0.8, surfaceMask: "all", blendMode: "replace", opacity: 1 },
    ],
    animation: {
        stages: [
            {
                frames: 100,
                durationMs: 15800,
                tracks: [
                    { targetPath: "motifs[3].hueShift", startValue: -180, endValue: 180 },
                    { targetPath: "motifs[2].gridSize", startValue: 8, endValue: 80 },
                ],
            },
        ],
    },
};

const cyberGrid = {
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
                    { targetPath: "motifs[2].gridSize", startValue: 12, endValue: 48 },
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 360 },
                ],
            },
        ],
    }
};

const magmaFlow = {
    warp: { frequency: 0.006, amplitude: 14, octaves: 2, sampleOffset: [400, 300] },
    palette: { base: [24, 8, 4], floorBase: [20, 6, 2], wallBase: [28, 10, 6] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [5, 2, 1] }, grain: { frequency: 0.4, octaves: 1, amplitude: 1.5 } },
        {
            type: "starburst",
            coordinateSpace: "warped",
            gridSize: 32,
            density: 0.45,
            radius: 20,
            spikes: 6,
            peak: 15,
            tint: [8, 2, 0.2],
            blendMode: "add",
            opacity: 0.9
        },
        {
            type: "fractalCracks",
            frequency: 0.015,
            octaves: 3,
            threshold: 0.72,
            peak: 12,
            tint: [6, 1.5, 0.1],
            blendMode: "screen",
            opacity: 0.8
        },
        {
            type: "filterPosterize",
            bands: 6,
            blendMode: "replace",
            opacity: 0.85
        }
    ],
    animation: {
        stages: [
            {
                frames: 40,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].radius", startValue: 8, endValue: 32 },
                    { targetPath: "motifs[3].bands", startValue: 4, endValue: 16 },
                ],
            },
        ],
    }
};

const organicPulse = {
    warp: { frequency: 0.007, amplitude: 18, octaves: 3, sampleOffset: [600, 900] },
    palette: { base: [2, 16, 12], floorBase: [1, 12, 10], wallBase: [4, 20, 16] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [1, 3, 2] }, grain: { frequency: 0.3, octaves: 1, amplitude: 1.0 } },
        {
            type: "concentricRings",
            coordinateSpace: "warped",
            frequency: 0.03,
            ringWidth: 0.06,
            peak: 14,
            tint: [0.1, 4.0, 2.5],
            blendMode: "add",
            opacity: 0.75
        },
        {
            type: "voronoiCell",
            coordinateSpace: "warped",
            density: 0.04,
            edgeWidth: 0.06,
            peak: 8,
            tint: [0.2, 3.0, 4.0],
            blendMode: "add",
            opacity: 0.6
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.2,
            value: 1.0,
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.015, endValue: 0.065 },
                    { targetPath: "motifs[3].hueShift", startValue: -60, endValue: 60 }
                ]
            }
        ]
    }
};

const toxicSludge = {
    warp: { frequency: 0.008, amplitude: 20, octaves: 3, sampleOffset: [500, 500] },
    palette: { base: [10, 25, 5], floorBase: [5, 15, 2], wallBase: [15, 30, 8] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 3, rgbDelta: [2, 8, 2] }, grain: { frequency: 0.5, octaves: 2, amplitude: 1.0 } },
        { type: "voronoiCell", coordinateSpace: "warped", density: 0.08, edgeWidth: 0.1, peak: 15, tint: [2, 8, 1], blendMode: "add", opacity: 0.8 },
        { type: "filterHSV", hueShift: 0, saturation: 1.5, value: 0.9, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 60,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[1].density", startValue: 0.06, endValue: 0.1 },
                    { targetPath: "motifs[2].hueShift", startValue: -20, endValue: 20 },
                ],
            },
        ],
    }
};

const frozenTundra = {
    warp: { frequency: 0.001, amplitude: 3, octaves: 1, sampleOffset: [100, 200] },
    palette: { base: [30, 35, 45], floorBase: [25, 30, 40], wallBase: [35, 40, 50] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.01, octaves: 4, rgbDelta: [5, 5, 10] }, grain: { frequency: 0.8, octaves: 2, amplitude: 0.3 } },
        { type: "fractalCracks", frequency: 0.008, octaves: 5, threshold: 0.5, peak: 20, tint: [10, 15, 25], blendMode: "screen", opacity: 0.9 },
        { type: "filterLevels", blackPoint: 20, whitePoint: 240, gamma: 1.1, blendMode: "replace", opacity: 1 }
    ]
};

const obsidianGlass = {
    warp: { frequency: 0.005, amplitude: 5, octaves: 2, sampleOffset: [0, 0] },
    palette: { base: [2, 2, 2], floorBase: [1, 1, 1], wallBase: [3, 3, 3] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.002, octaves: 1, rgbDelta: [1, 1, 1] }, grain: { frequency: 0.1, octaves: 1, amplitude: 0.1 } },
        { type: "fractalCracks", frequency: 0.003, octaves: 2, threshold: 0.8, peak: 5, tint: [2, 1, 4], blendMode: "color-dodge", opacity: 0.6 }
    ]
};

const goldenTemple = {
    warp: { frequency: 0.003, amplitude: 10, octaves: 2, sampleOffset: [800, 100] },
    palette: { base: [30, 20, 5], floorBase: [25, 15, 3], wallBase: [35, 25, 8] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.008, octaves: 3, rgbDelta: [10, 5, 1] }, grain: { frequency: 1.2, octaves: 1, amplitude: 0.4 } },
        { type: "celticWeave", coordinateSpace: "warped", gridSize: 64, pipeWidth: 8, peak: 12, tint: [15, 10, 2], blendMode: "screen", opacity: 0.8 },
        { type: "filterPosterize", bands: 8, blendMode: "replace", opacity: 0.7 }
    ]
};

const abyssalDepths = {
    warp: { frequency: 0.01, amplitude: 25, octaves: 4, sampleOffset: [1000, 1000] },
    palette: { base: [1, 3, 8], floorBase: [0, 2, 6], wallBase: [2, 5, 12] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 3, rgbDelta: [1, 2, 5] }, grain: { frequency: 0.6, octaves: 2, amplitude: 0.8 } },
        { type: "concentricRings", coordinateSpace: "warped", frequency: 0.05, ringWidth: 0.02, peak: 10, tint: [1, 5, 15], blendMode: "screen", opacity: 0.5 },
        { type: "starburst", coordinateSpace: "warped", gridSize: 48, density: 0.2, radius: 15, spikes: 4, peak: 8, tint: [2, 8, 20], blendMode: "add", opacity: 0.7 }
    ],
    animation: {
        stages: [
            {
                frames: 120,
                durationMs: 8000,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.04, endValue: 0.06 },
                    { targetPath: "motifs[2].radius", startValue: 10, endValue: 20 },
                ],
            },
        ],
    }
};

const neonWireframe = {
    warp: { frequency: 0.0, amplitude: 0, octaves: 1, sampleOffset: [0, 0] },
    palette: { base: [0, 0, 0], floorBase: [0, 0, 0], wallBase: [2, 2, 2] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.001, octaves: 1, rgbDelta: [0, 0, 0] }, grain: { frequency: 0.1, octaves: 1, amplitude: 0.1 } },
        { type: "hexGrid", cellWorldSize: 32, groutWidth: 0.02, groutPeak: 20, groutTint: [0, 25, 15], bevelWidth: 0, highlightPeak: 0, shadowPeak: 0, cellVariation: 0, blendMode: "screen", opacity: 1 },
        { type: "circuitTraces", coordinateSpace: "eval", gridSize: 64, lineWidth: 2.0, density: 0.8, diagDensity: 0.5, peak: 25, tint: [25, 0, 20], padEnabled: false, blendMode: "add", opacity: 1 },
        { type: "filterHSV", hueShift: 0, saturation: 2.0, value: 1.5, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 90,
                durationMs: 6000,
                tracks: [
                    { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 360 },
                ],
            },
        ],
    }
};

const pulsingPortal = {
    warp: { frequency: 0.003, amplitude: 6, octaves: 2, sampleOffset: [200, 200] },
    palette: { base: [10, 5, 20], floorBase: [5, 2, 12], wallBase: [15, 8, 25] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 2, 4] }, grain: { frequency: 0.2, octaves: 1, amplitude: 0.5 } },
        {
            type: "concentricRings",
            coordinateSpace: "warped",
            frequency: 0.03,
            ringWidth: 0.08,
            peak: 15,
            offset: [0, 0],
            tint: [0.2, 3.5, 5.0],
            opacity: 0.9,
            blendMode: "add"
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.5,
            value: 1.2,
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 45,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.02, endValue: 0.08 },
                    { targetPath: "motifs[2].hueShift", startValue: 0, endValue: 180 }
                ]
            },
            {
                frames: 45,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].frequency", startValue: 0.08, endValue: 0.02 },
                    { targetPath: "motifs[2].hueShift", startValue: 180, endValue: 360 }
                ]
            }
        ]
    }
};

const neonGridwave = {
    warp: { frequency: 0.001, amplitude: 2, octaves: 1, sampleOffset: [0, 0] },
    palette: { base: [5, 5, 10], floorBase: [2, 2, 5], wallBase: [10, 10, 15] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.001, octaves: 1, rgbDelta: [0, 0, 0] }, grain: { frequency: 0.1, octaves: 1, amplitude: 0.1 } },
        {
            type: "hexGrid",
            cellWorldSize: 24,
            groutWidth: 0.05,
            groutPeak: 12,
            groutTint: [0, 4, 8],
            bevelWidth: 0.02,
            highlightPeak: 6,
            shadowPeak: -4,
            cellVariation: 1,
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "circuitTraces",
            coordinateSpace: "warped",
            gridSize: 32,
            lineWidth: 3,
            density: 0.5,
            diagDensity: 0.2,
            peak: 15,
            tint: [8, 0, 8],
            padEnabled: true,
            blendMode: "color-dodge",
            opacity: 0.9
        }
    ],
    animation: {
        stages: [
            {
                frames: 40,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].cellWorldSize", startValue: 16, endValue: 32 },
                    { targetPath: "motifs[2].gridSize", startValue: 48, endValue: 16 }
                ]
            },
            {
                frames: 40,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].cellWorldSize", startValue: 32, endValue: 16 },
                    { targetPath: "motifs[2].gridSize", startValue: 16, endValue: 48 }
                ]
            }
        ]
    }
};

const chronosEngine = {
    warp: { frequency: 0.004, amplitude: 8, octaves: 2, sampleOffset: [300, 400] },
    palette: { base: [15, 10, 25], floorBase: [8, 5, 18], wallBase: [20, 15, 30] },
    motifs: [
        {
            type: "baseMetal",
            structure: { frequency: 0.01, octaves: 2, rgbDelta: [3, 2, 6] },
            grain: { frequency: 0.5, octaves: 1, amplitude: 1.0 },
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "translate",
            x: 0,
            y: 0,
            coordinateMode: "evalAndWarped",
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "concentricRings",
            coordinateSpace: "warped",
            frequency: 0.025,
            ringWidth: 0.05,
            peak: 12,
            offset: [0, 0],
            tint: [0.2, 2.5, 4.0],
            surfaceMask: "all",
            blendMode: "add",
            opacity: 0.8
        },
        {
            type: "starburst",
            coordinateSpace: "warped",
            gridSize: 48,
            density: 0.3,
            radius: 12,
            spikes: 6,
            peak: 14,
            tint: [4.0, 1.2, 0.5],
            surfaceMask: "all",
            blendMode: "add",
            opacity: 0.75
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.6,
            value: 1.3,
            surfaceMask: "all",
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 40,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 0, endValue: 40, easing: "easeInOutQuad" },
                    { targetPath: "motifs[1].y", startValue: 0, endValue: -40, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].ringWidth", startValue: 0.04, endValue: 0.16, easing: "easeInCubic" },
                    { targetPath: "motifs[3].radius", startValue: 8, endValue: 24, easing: "easeOutQuad" },
                    { targetPath: "motifs[4].hueShift", startValue: 0, endValue: 120, easing: "linear" }
                ]
            },
            {
                frames: 40,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 40, endValue: -40, easing: "easeInOutQuad" },
                    { targetPath: "motifs[1].y", startValue: -40, endValue: 40, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].ringWidth", startValue: 0.16, endValue: 0.08, easing: "easeInOutSine" },
                    { targetPath: "motifs[3].radius", startValue: 24, endValue: 12, easing: "easeInQuad" },
                    { targetPath: "motifs[4].hueShift", startValue: 120, endValue: 240, easing: "linear" }
                ]
            },
            {
                frames: 40,
                durationMs: 2000,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: -40, endValue: 0, easing: "easeInOutQuad" },
                    { targetPath: "motifs[1].y", startValue: 40, endValue: 0, easing: "easeInOutQuad" },
                    { targetPath: "motifs[2].ringWidth", startValue: 0.08, endValue: 0.04, easing: "easeOutCubic" },
                    { targetPath: "motifs[3].radius", startValue: 12, endValue: 8, easing: "easeInOutQuad" },
                    { targetPath: "motifs[4].hueShift", startValue: 240, endValue: 360, easing: "linear" }
                ]
            }
        ]
    }
};

const hyperDrive = {
    warp: { frequency: 0.002, amplitude: 4, octaves: 1, sampleOffset: [100, 500] },
    palette: { base: [5, 5, 10], floorBase: [2, 2, 6], wallBase: [10, 10, 15] },
    motifs: [
        {
            type: "baseMetal",
            structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 2, 4] },
            grain: { frequency: 0.8, octaves: 1, amplitude: 0.5 },
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "translate",
            x: 0,
            y: 0,
            coordinateMode: "evalAndWarped",
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "circuitPanels",
            coordinateSpace: "warped",
            gridSize: 20,
            density: 0.6,
            cellVariation: 4,
            groutWidth: 0.06,
            groutPeak: -8,
            groutTint: [1, 1, 1],
            bevelWidth: 0.04,
            highlightPeak: 6,
            shadowPeak: -4,
            bevelTint: [1, 1, 1],
            sunkenDarken: 4,
            sunkenShadowPeak: -4,
            sunkenHighlightPeak: 3,
            rivetRadius: 0.1,
            rivetSpacing: 0.15,
            rivetPeak: 5,
            rivetTint: [1.2, 1.2, 1.8],
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "circuitTraces",
            coordinateSpace: "warped",
            gridSize: 40,
            lineWidth: 2,
            density: 0.55,
            diagDensity: 0.1,
            peak: 10,
            tint: [0.8, 3.5, 5.0],
            padEnabled: true,
            surfaceMask: "all",
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.5,
            value: 1.0,
            surfaceMask: "all",
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 1500,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 0, endValue: 8, easing: "easeInQuad" },
                    { targetPath: "motifs[1].y", startValue: 0, endValue: 6, easing: "easeInQuad" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 6, endValue: 16, easing: "easeInExpo" },
                    { targetPath: "motifs[3].lineWidth", startValue: 1.5, endValue: 5.5, easing: "easeInQuint" },
                    { targetPath: "motifs[4].value", startValue: 1.0, endValue: 1.8, easing: "easeInSine" },
                    { targetPath: "motifs[4].hueShift", startValue: 0, endValue: 90, easing: "linear" }
                ]
            },
            {
                frames: 20,
                durationMs: 800,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 8, endValue: -12, easing: "easeInOutExpo" },
                    { targetPath: "motifs[1].y", startValue: 6, endValue: -10, easing: "easeInOutExpo" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 16, endValue: 4, easing: "easeOutCirc" },
                    { targetPath: "motifs[3].lineWidth", startValue: 5.5, endValue: 1.0, easing: "easeOutExpo" },
                    { targetPath: "motifs[4].value", startValue: 1.8, endValue: 0.6, easing: "easeOutQuint" },
                    { targetPath: "motifs[4].hueShift", startValue: 90, endValue: 210, easing: "linear" }
                ]
            },
            {
                frames: 40,
                durationMs: 2200,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: -12, endValue: 0, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].y", startValue: -10, endValue: 0, easing: "easeOutQuad" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 4, endValue: 6, easing: "easeInOutQuad" },
                    { targetPath: "motifs[3].lineWidth", startValue: 1.0, endValue: 1.5, easing: "easeInOutSine" },
                    { targetPath: "motifs[4].value", startValue: 0.6, endValue: 1.0, easing: "easeInOutCubic" },
                    { targetPath: "motifs[4].hueShift", startValue: 210, endValue: 360, easing: "linear" }
                ]
            }
        ]
    }
};

const plasmaReactor = {
    warp: { frequency: 0.003, amplitude: 6, octaves: 2, sampleOffset: [200, 300] },
    palette: { base: [10, 15, 20], floorBase: [5, 8, 15], wallBase: [15, 20, 25] },
    motifs: [
        {
            type: "baseMetal",
            structure: { frequency: 0.004, octaves: 3, rgbDelta: [2, 3, 5] },
            grain: { frequency: 1.0, octaves: 1, amplitude: 0.8 },
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "translate",
            x: 0,
            y: 0,
            coordinateMode: "evalAndWarped",
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "circuitPanels",
            coordinateSpace: "warped",
            gridSize: 18,
            density: 0.5,
            cellVariation: 3,
            groutWidth: 0.06,
            groutPeak: -8,
            groutTint: [1, 1, 1],
            bevelWidth: 0.03,
            highlightPeak: 5,
            shadowPeak: -4,
            bevelTint: [1, 1, 1],
            sunkenDarken: 4,
            sunkenShadowPeak: -4,
            sunkenHighlightPeak: 3,
            rivetRadius: 0.08,
            rivetSpacing: 0.12,
            rivetPeak: 4,
            rivetTint: [1.2, 1.2, 1.8],
            surfaceMask: "all",
            blendMode: "add",
            opacity: 1
        },
        {
            type: "circuitTraces",
            coordinateSpace: "warped",
            gridSize: 36,
            lineWidth: 2,
            density: 0.5,
            diagDensity: 0.15,
            peak: 12,
            tint: [4.5, 4.0, 0.5],
            padEnabled: true,
            surfaceMask: "all",
            blendMode: "add",
            opacity: 0.55
        },
        {
            type: "starburst",
            coordinateSpace: "warped",
            gridSize: 36,
            density: 0.35,
            radius: 8,
            spikes: 8,
            peak: 12,
            tint: [0.2, 3.0, 5.0],
            surfaceMask: "floor",
            blendMode: "add",
            opacity: 0.9
        },
        {
            type: "filterHSV",
            hueShift: 0,
            saturation: 1.4,
            value: 1.0,
            surfaceMask: "all",
            blendMode: "replace",
            opacity: 1
        }
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 1200,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 0, endValue: 3, easing: "easeInQuad" },
                    { targetPath: "motifs[1].y", startValue: 0, endValue: 2, easing: "easeInQuad" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 5, endValue: 15, easing: "easeInCubic" },
                    { targetPath: "motifs[3].lineWidth", startValue: 1.5, endValue: 4.5, easing: "easeInQuint" },
                    { targetPath: "motifs[4].radius", startValue: 6, endValue: 24, easing: "easeInQuad" },
                    { targetPath: "motifs[5].value", startValue: 1.0, endValue: 1.6, easing: "easeInSine" }
                ]
            },
            {
                frames: 20,
                durationMs: 600,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 3, endValue: -5, easing: "easeInOutExpo" },
                    { targetPath: "motifs[1].y", startValue: 2, endValue: -4, easing: "easeInOutExpo" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 15, endValue: 4, easing: "easeOutCirc" },
                    { targetPath: "motifs[3].lineWidth", startValue: 4.5, endValue: 6.5, easing: "easeInExpo" },
                    { targetPath: "motifs[4].radius", startValue: 24, endValue: 32, easing: "easeOutExpo" },
                    { targetPath: "motifs[5].value", startValue: 1.6, endValue: 0.7, easing: "easeOutQuint" }
                ]
            },
            {
                frames: 40,
                durationMs: 1800,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: -5, endValue: 0, easing: "easeOutQuad" },
                    { targetPath: "motifs[1].y", startValue: -4, endValue: 0, easing: "easeOutQuad" },
                    { targetPath: "motifs[2].highlightPeak", startValue: 4, endValue: 5, easing: "easeInOutQuad" },
                    { targetPath: "motifs[3].lineWidth", startValue: 6.5, endValue: 1.5, easing: "easeOutQuint" },
                    { targetPath: "motifs[4].radius", startValue: 32, endValue: 6, easing: "easeOutQuad" },
                    { targetPath: "motifs[5].value", startValue: 0.7, endValue: 1.0, easing: "easeInOutCubic" }
                ]
            }
        ]
    }
};

const shatteredDimension = {
    warp: { frequency: 0.005, amplitude: 10, octaves: 2, sampleOffset: [500, 100] },
    palette: { base: [10, 5, 20], floorBase: [8, 4, 15], wallBase: [15, 8, 30] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 1, 4] }, grain: { frequency: 0.3, octaves: 1, amplitude: 0.5 } },
        {
            type: "fractalCracks",
            frequency: 0.01,
            octaves: 4,
            threshold: 0.6,
            peak: 18,
            tint: [5, 1, 8],
            blendMode: "screen",
            opacity: 0.9
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.5, value: 1.2, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].threshold", startValue: 0.7, endValue: 0.4, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].peak", startValue: 10, endValue: 25, easing: "easeOutQuad" },
                    { targetPath: "motifs[2].hueShift", startValue: 0, endValue: 60, easing: "linear" }
                ]
            },
            {
                frames: 50,
                durationMs: 3000,
                tracks: [
                    { targetPath: "motifs[1].threshold", startValue: 0.4, endValue: 0.7, easing: "easeInOutSine" },
                    { targetPath: "motifs[1].peak", startValue: 25, endValue: 10, easing: "easeInQuad" },
                    { targetPath: "motifs[2].hueShift", startValue: 60, endValue: 0, easing: "linear" }
                ]
            }
        ]
    }
};

const voidFissures = {
    warp: { frequency: 0.002, amplitude: 4, octaves: 2, sampleOffset: [1000, 2000] },
    palette: { base: [2, 2, 5], floorBase: [1, 1, 3], wallBase: [4, 4, 8] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.002, octaves: 3, rgbDelta: [1, 1, 2] }, grain: { frequency: 0.5, octaves: 2, amplitude: 0.6 } },
        { type: "translate", x: 0, y: 0, coordinateMode: "evalAndWarped", blendMode: "add", opacity: 1 },
        {
            type: "fractalCracks",
            frequency: 0.015,
            octaves: 3,
            threshold: 0.8,
            peak: 20,
            tint: [0.5, 8.0, 4.0],
            blendMode: "color-dodge",
            opacity: 1
        },
        { type: "filterHSV", hueShift: 0, saturation: 1.8, value: 1.5, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 60,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 0, endValue: 20, easing: "linear" },
                    { targetPath: "motifs[1].y", startValue: 0, endValue: 15, easing: "linear" },
                    { targetPath: "motifs[2].threshold", startValue: 0.85, endValue: 0.75, easing: "easeInOutQuad" }
                ]
            },
            {
                frames: 60,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[1].x", startValue: 20, endValue: 40, easing: "linear" },
                    { targetPath: "motifs[1].y", startValue: 15, endValue: 30, easing: "linear" },
                    { targetPath: "motifs[2].threshold", startValue: 0.75, endValue: 0.85, easing: "easeInOutQuad" }
                ]
            }
        ]
    }
};

export const floorProceduralProfiles = {
    ancientRuins,
    cyberGrid,
    magmaFlow,
    organicPulse,
    toxicSludge,
    frozenTundra,
    obsidianGlass,
    goldenTemple,
    abyssalDepths,
    neonWireframe,
    pulsingPortal,
    neonGridwave,
    chronosEngine,
    hyperDrive,
    plasmaReactor,
    shatteredDimension,
    voidFissures
};

export const START_STATION_ID = "organicPulse";

export const defaultFloorProceduralProfileId = START_STATION_ID;

export const startFloorProceduralProfileId = START_STATION_ID;

export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: START_STATION_ID,
    MazeStrategy: "cyberGrid",
    Maze2Strategy: "cyberGrid",
    DenseMazeStrategy: "cyberGrid",
    SquareStrategy: "cyberGrid",
    GeometricStrategy: "magmaFlow",
    FortressStrategy: "magmaFlow",
    HoneycombStrategy: "organicPulse",
    DiamondStrategy: "organicPulse",
};

const runtimeFloorProfiles = {};

export function registerRuntimeFloorProfile(profileId, profile) {
    runtimeFloorProfiles[profileId] = profile;
}

export function unregisterRuntimeFloorProfile(profileId) {
    delete runtimeFloorProfiles[profileId];
}

export function getFloorProceduralProfile(profileId) {
    const profile = runtimeFloorProfiles[profileId] ?? floorProceduralProfiles[profileId];
    if (!profile) {
        throw new Error(`Unknown floor procedural profile: ${profileId}`);
    }
    return profile;
}

export function listShippedFloorProfileIds() {
    return Object.keys(floorProceduralProfiles);
}

export function resolveFloorTextureProfileId({ layer, strategy }) {
    if (layer === 0) {
        return startFloorProceduralProfileId;
    }
    const profileId = floorProceduralProfileByStrategy[strategy];
    if (!profileId) {
        throw new Error(`No floor procedural profile mapped for strategy: ${strategy}`);
    }
    return profileId;
}