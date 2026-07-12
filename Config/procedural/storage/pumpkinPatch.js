import { SURFACE_MASK_FLOOR, SURFACE_MASK_WALL, SURFACE_MASK_ALL } from "../../../Core/engineEnums.js";
export default {
    warp: { frequency: 0.007, amplitude: 12, octaves: 2, sampleOffset: [400, 300] },
    palette: { base: [15, 8, 2], floorBase: [8, 4, 1], wallBase: [16, 6, 2] },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.005, octaves: 2, rgbDelta: [2, 1, 0] }, grain: { frequency: 0.35, octaves: 2, amplitude: 0.6 } },
        {
            type: "stainBlotch",
            surfaceMask: SURFACE_MASK_FLOOR,
            coordinateSpace: "eval",
            frequency: 0.02,
            threshold: 0.4,
            peak: 8,
            tint: [-3.5, -2, -1],
            octaves: 2,
            opacity: 0.7,
            blendMode: "add"
        },
        {
            type: "topoContours",
            surfaceMask: SURFACE_MASK_FLOOR,
            coordinateSpace: "warped",
            frequency: 0.015,
            bands: 8,
            thickness: 0.12,
            peak: 12,
            tint: [2.0, 1.0, 0.1],
            blendMode: "add",
            opacity: 0.7
        },
        {
            type: "wallHorizontalBevel",
            surfaceMask: SURFACE_MASK_WALL,
            bands: 3,
            ribFill: 0.5,
            highlightPeak: 10,
            shadowPeak: 14,
            coreWidth: 0.3,
            corePeak: 22,
            coreTint: [2.8, 1.2, 0.1],
            blendMode: "add",
            opacity: 0.95
        },
        {
            type: "circuitLattice",
            surfaceMask: SURFACE_MASK_ALL,
            coordinateSpace: "eval",
            frequency: 0.018,
            angle: 0.25,
            ridgeThreshold: 0.08,
            peak: 22,
            intersectionPeak: 26,
            tint: [0.2, 2.0, 0.4],
            intersectionTint: [0.5, 2.5, 0.6],
            blendMode: "add",
            opacity: 0.85
        },
        {
            type: "wallLighting",
            surfaceMask: SURFACE_MASK_WALL,
            power: 1.4,
            topDarken: 22,
            coolBias: 1.02,
            blendMode: "multiply",
            opacity: 1
        },
        { type: "filterHSV", surfaceMask: SURFACE_MASK_ALL, hueShift: 0, saturation: 1.6, value: 1.0, blendMode: "replace", opacity: 1 }
    ],
    animation: {
        stages: [
            {
                frames: 30,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[4].angle", startValue: 0.25, endValue: 0.55, easing: "easeInOutSine" },
                    { targetPath: "motifs[6].hueShift", startValue: -10, endValue: 15, easing: "linear" }
                ]
            },
            {
                frames: 30,
                durationMs: 4000,
                tracks: [
                    { targetPath: "motifs[4].angle", startValue: 0.55, endValue: 0.25, easing: "easeInOutSine" },
                    { targetPath: "motifs[6].hueShift", startValue: 15, endValue: -10, easing: "linear" }
                ]
            }
        ]
    }
};
