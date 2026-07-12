import { SURFACE_MASK_ALL, SURFACE_MASK_FLOOR, SURFACE_MASK_WALL } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.004, amplitude: 5, octaves: 2, sampleOffset: [200, 200] },
    palette: { base: [14, 10, 8], floorBase: [10, 8, 6], wallBase: [4, 4, 4] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.006, octaves: 3, rgbDelta: [3, 2, 1] }, grain: { frequency: 0.4, octaves: 2, amplitude: 0.8 } },
        {
            type: "stainBlotch",
            surfaceMask: SURFACE_MASK_ALL,
            coordinateSpace: "eval",
            frequency: 0.012,
            threshold: 0.45,
            peak: 8,
            offset: [50, 50],
            tint: [-3.0, -2.6, -2.2], // Dark rust/grime stains
            octaves: 2,
            opacity: 0.75,
            blendMode: "add"
        },
        {
            type: "deckPlates",
            surfaceMask: SURFACE_MASK_FLOOR,
            cellWorldSize: 32,
            plateCells: 2,
            plateRows: 2,
            groutWidth: 0.04,
            groutPeak: 12,
            groutTint: [-10, -10, -8], // Dark gap between plates
            plateVariation: 6,
            jitterOffset: [0, 0],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.018,
            rivetPeak: 8,
            rivetTint: [1.2, 0.8, 0.5],
            blendMode: "multiply",
            opacity: 0.9
        },
        {
            type: "wallHorizontalBevel",
            surfaceMask: SURFACE_MASK_WALL,
            bands: 6,
            ribFill: 0.6,
            highlightPeak: 6,
            shadowPeak: 12,
            coreWidth: 0.25,
            corePeak: 15,
            coreTint: [1.8, 0.8, 0.2], // Glowing flickering orange electrical line
            snakeStrength: 0,
            blendMode: "add",
            opacity: 0.8
        },
        {
            type: "circuitTraces",
            surfaceMask: SURFACE_MASK_ALL,
            coordinateSpace: "warped",
            gridSize: 32,
            lineWidth: 1.5,
            density: 0.45,
            diagDensity: 0.2,
            peak: 25,
            tint: [2.2, 0.8, 0.2], // Glowing copper circuits
            padEnabled: true,
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "wallLighting",
            surfaceMask: SURFACE_MASK_WALL,
            power: 1.3,
            topDarken: 25, // Heavily darken top of walls
            coolBias: 1.06,
            blendMode: "multiply",
            opacity: 1
        },
        { type: "filterHSV", surfaceMask: SURFACE_MASK_ALL, hueShift: 0, saturation: 1.4, value: 0.85, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 800,
                tracks: [
                    { targetPath: "motifs[3].corePeak", startValue: 15, endValue: 4, easing: "easeInOutSine" },
                    { targetPath: "motifs[4].peak", startValue: 25, endValue: 6, easing: "easeInOutSine" }
                ]
            },
            {
                frames: 10,
                durationMs: 200,
                tracks: [
                    { targetPath: "motifs[3].corePeak", startValue: 4, endValue: 24, easing: "easeOutQuad" },
                    { targetPath: "motifs[4].peak", startValue: 6, endValue: 32, easing: "easeOutQuad" }
                ]
            },
            {
                frames: 20,
                durationMs: 400,
                tracks: [
                    { targetPath: "motifs[3].corePeak", startValue: 24, endValue: 0, easing: "easeInQuad" },
                    { targetPath: "motifs[4].peak", startValue: 32, endValue: 0, easing: "easeInQuad" }
                ]
            },
            {
                frames: 30,
                durationMs: 600,
                tracks: [
                    { targetPath: "motifs[3].corePeak", startValue: 0, endValue: 15, easing: "easeOutCubic" },
                    { targetPath: "motifs[4].peak", startValue: 0, endValue: 25, easing: "easeOutCubic" }
                ]
            }
        ]
    }
};
