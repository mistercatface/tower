import { combatVisualSettings } from "./Config.js";

/** @typedef {"eval" | "warped"} ProceduralCoordinateSpace */

/** Station deck — grid plates + continuous warped vein field (floor→wall). */
const spaceStation = {
    warp: { frequency: 0.004, amplitude: 9, octaves: 2, sampleOffset: [120, 480] },
    palette: { base: [22, 24, 28], floorBase: [20, 22, 26], wallBase: [24, 26, 30], shadow: combatVisualSettings.floorShadow },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.0025, octaves: 2, rgbDelta: [3, 3, 4] }, grain: { frequency: 0.18, octaves: 1, amplitude: 1 } },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.015,
            octaves: 2,
            angle: 0.22,
            offset: [200, 600],
            ridgeThreshold: 0.12,
            peak: 7,
            tint: [0.2, 0.35, 0.55],
            intersectionThreshold: 0.13,
            intersectionPeak: 9,
            intersectionTint: [0.35, 0.85, 1.25],
            interiorVariation: { frequency: 0.05, amplitude: 1, tint: [0.5, 1, 1.5] },
            blendMode: "add",
            opacity: 0.48,
        },
        {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 2,
            groutWidth: 0.045,
            groutPeak: 9,
            groutTint: [-6, -6, -5],
            plateVariation: 2,
            jitterOffset: [40, 120],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.018,
            rivetPeak: 4,
            rivetTint: [2, 4, 5],
            blendMode: "multiply",
            opacity: 0.72,
        },
        { type: "wallLighting", power: 1, topDarken: 5, coolBias: 1.04, surfaceMask: "wall" },
    ],
};

/** Clinical sci-fi corridor — deck plates + unified warped veins (rootForest-style cohesion). */
const techCorridor = {
    warp: { frequency: 0.0035, amplitude: 11, octaves: 2, sampleOffset: [400, 800] },
    palette: { base: [34, 36, 40], floorBase: [36, 38, 42], wallBase: [38, 40, 44], shadow: combatVisualSettings.floorShadow },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.002, octaves: 2, rgbDelta: [1, 1, 2] }, grain: { frequency: 0.15, octaves: 1, amplitude: 0.35 } },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.016,
            octaves: 2,
            angle: 0.28,
            offset: [500, 200],
            ridgeThreshold: 0.12,
            peak: 9,
            tint: [0.45, 0.3, 0.08],
            intersectionThreshold: 0.13,
            intersectionPeak: 10,
            intersectionTint: [0.35, 0.85, 1.15],
            interiorVariation: { frequency: 0.05, amplitude: 1.2, tint: [0.4, 0.5, 1] },
            blendMode: "add",
            opacity: 0.52,
        },
        {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 2,
            groutWidth: 0.04,
            groutPeak: 5,
            groutTint: [-4, -4, -3],
            accentWidth: 0.018,
            accentPeak: 4,
            accentTint: [5, 1, -2],
            plateVariation: 0.5,
            jitterOffset: [20, 60],
            rivetSpacing: 0,
            blendMode: "multiply",
            opacity: 0.65,
        },
        {
            type: "panelBay",
            rows: 5,
            cols: 2,
            inset: 0.16,
            frameWidth: 0.07,
            highlightPeak: 3,
            shadowPeak: 4,
            rimPeak: 4,
            rimTint: [0.3, 0.85, 1.2],
            interiorDarken: 4,
            surfaceMask: "wallFace",
            opacity: 0.55,
            blendMode: "add",
        },
        { type: "wallLighting", power: 0.95, topDarken: 3, coolBias: 1.02, surfaceMask: "wall" },
    ],
};

// Bioluminescent alien organic — deep teal base, glowing cyan veins, pulsing light nodes
const bioneural = {
    warp: { frequency: 0.006, amplitude: 18, octaves: 2, sampleOffset: [400, 800] },
    palette: { base: [4, 14, 18], floorBase: [3, 12, 16], wallBase: [6, 16, 22], shadow: "#020a0d" },
    animation: { targetPath: "motifs[5].hueShift", startValue: 0, endValue: 360, frames: 30, durationMs: 2000 },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [1, 2, 3] }, grain: { frequency: 0.3, octaves: 1, amplitude: 2 } },
        { type: "voronoiCell", coordinateSpace: "warped", density: 0.035, edgeWidth: 3.5, peak: 10, tint: [0.3, 2.2, 2.8], seedSalt: 42, opacity: 0.85, blendMode: "add" },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.018,
            octaves: 2,
            angle: 0.6,
            ridgeThreshold: 0.1,
            peak: 12,
            tint: [0.2, 2.5, 3.0],
            intersectionPeak: 18,
            intersectionTint: [0.5, 3.5, 4.0],
            opacity: 0.8,
            blendMode: "add",
        },
        { type: "fractalCracks", frequency: 0.012, octaves: 3, threshold: 0.7, peak: 14, tint: [0.3, 2.0, 2.5], opacity: 0.9, blendMode: "screen" },
        { type: "starburst", coordinateSpace: "warped", gridSize: 24, density: 0.4, radius: 22, spikes: 4, peak: 18, tint: [0.3, 3.0, 3.5], opacity: 0.75, blendMode: "add" },
        { type: "filterHSV", hueShift: 5, saturation: 1.35, value: 1.05, blendMode: "replace", opacity: 1 },
        { type: "filterLevels", blackPoint: 4, whitePoint: 240, gamma: 1.15, blendMode: "replace", opacity: 1 },
        { type: "wallLighting", power: 1.1, topDarken: 6, coolBias: 1.08, surfaceMask: "wall" },
    ],
};

// Amber forge halls — molten industrial with hot rivets and ember veins
const forgeHalls = {
    warp: { frequency: 0.005, amplitude: 10, octaves: 2, sampleOffset: [900, 300] },
    palette: { base: [20, 12, 6], floorBase: [18, 10, 5], wallBase: [24, 14, 8], shadow: "#0d0704" },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [3, 2, 1] }, grain: { frequency: 0.6, octaves: 1, amplitude: 2.5 } },
        {
            type: "deckPlates",
            cellWorldSize: 20,
            plateCells: 2,
            groutWidth: 0.05,
            groutPeak: -8,
            groutTint: [1, 1, 1],
            plateVariation: 1.5,
            jitterOffset: [100, 200],
            rivetSpacing: 20,
            rivetInset: 5,
            rivetRadius: 0.02,
            rivetPeak: 8,
            rivetTint: [3, 1.5, 0.3],
            blendMode: "multiply",
            opacity: 0.7,
        },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.016,
            octaves: 2,
            angle: 0.15,
            ridgeThreshold: 0.11,
            peak: 14,
            tint: [3.5, 1.2, 0.1],
            intersectionPeak: 20,
            intersectionTint: [4.0, 2.0, 0.2],
            opacity: 0.85,
            blendMode: "add",
        },
        { type: "fractalCracks", frequency: 0.013, octaves: 3, threshold: 0.68, peak: 18, tint: [4.0, 1.5, 0.2], opacity: 0.85, blendMode: "screen" },
        { type: "starburst", coordinateSpace: "warped", gridSize: 28, density: 0.35, radius: 28, spikes: 2, peak: 20, tint: [4.0, 2.0, 0.3], opacity: 0.65, blendMode: "add" },
        { type: "filterHSV", hueShift: 8, saturation: 1.4, value: 1.0, blendMode: "replace", opacity: 1 },
        { type: "filterLevels", blackPoint: 8, whitePoint: 235, gamma: 1.2, blendMode: "replace", opacity: 1 },
        {
            type: "panelBay",
            rows: 4,
            cols: 2,
            inset: 0.14,
            frameWidth: 0.06,
            highlightPeak: 4,
            shadowPeak: 5,
            rimPeak: 5,
            rimTint: [2.5, 1.0, 0.1],
            interiorDarken: 5,
            surfaceMask: "wallFace",
            opacity: 0.65,
            blendMode: "add",
        },
        { type: "wallLighting", power: 1.05, topDarken: 8, coolBias: 0.95, surfaceMask: "wall" },
    ],
};

// Phantom station — cold violet-blue, ghostly circuit traces, deep recessed panels
const phantomStation = {
    warp: { frequency: 0.004, amplitude: 12, octaves: 2, sampleOffset: [1800, 700] },
    palette: { base: [8, 6, 22], floorBase: [6, 5, 18], wallBase: [10, 8, 28], shadow: "#040312" },
    motifs: [
        { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [1, 1, 3] }, grain: { frequency: 0.2, octaves: 1, amplitude: 1 } },
        {
            type: "circuitPanels",
            coordinateSpace: "warped",
            gridSize: 20,
            density: 0.45,
            cellVariation: 3,
            groutWidth: 0.05,
            groutPeak: -12,
            groutTint: [1, 1, 1],
            bevelWidth: 0.05,
            highlightPeak: 7,
            shadowPeak: -5,
            bevelTint: [0.8, 0.9, 1.0],
            rivetRadius: 0.08,
            rivetSpacing: 0.14,
            rivetPeak: 6,
            rivetTint: [1.5, 1.8, 3.5],
            blendMode: "add",
            opacity: 0.9,
        },
        {
            type: "circuitLattice",
            coordinateSpace: "warped",
            frequency: 0.022,
            octaves: 2,
            angle: 0.4,
            ridgeThreshold: 0.09,
            peak: 10,
            tint: [1.5, 1.8, 3.5],
            intersectionPeak: 16,
            intersectionTint: [2.0, 2.5, 4.5],
            opacity: 0.7,
            blendMode: "add",
        },
        { type: "fractalCracks", frequency: 0.01, octaves: 4, threshold: 0.78, peak: 16, tint: [1.5, 2.0, 4.0], opacity: 0.75, blendMode: "screen" },
        { type: "starburst", coordinateSpace: "warped", gridSize: 18, density: 0.3, radius: 20, spikes: 3, peak: 22, tint: [1.8, 2.2, 4.5], opacity: 0.6, blendMode: "add" },
        { type: "filterHSV", hueShift: -10, saturation: 1.3, value: 1.0, blendMode: "replace", opacity: 1 },
        { type: "filterLevels", blackPoint: 6, whitePoint: 245, gamma: 1.1, blendMode: "replace", opacity: 1 },
        {
            type: "panelBay",
            rows: 6,
            cols: 2,
            inset: 0.18,
            frameWidth: 0.07,
            highlightPeak: 3,
            shadowPeak: 4,
            rimPeak: 5,
            rimTint: [1.2, 1.5, 3.5],
            interiorDarken: 6,
            surfaceMask: "wallFace",
            opacity: 0.6,
            blendMode: "add",
        },
        { type: "wallLighting", power: 1.0, topDarken: 5, coolBias: 1.12, surfaceMask: "wall" },
    ],
};

/**
 * Procedural floor/wall texture profiles. Add motifs here to change the look;
 * implement new motif types under Procedural/Motifs/.
 */
export const floorProceduralProfiles = {
    spaceStation,
    techCorridor,
    bioneural,
    forgeHalls,
    phantomStation,
    cleanserStation: spaceStation,
    startStation: spaceStation,

    cargoBay: {
        warp: { frequency: 0.004, amplitude: 10, octaves: 2, sampleOffset: [300, 700] },
        palette: { base: [27, 25, 22], floorBase: [28, 26, 23], wallBase: [25, 23, 20], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "baseMetal", structure: { frequency: 0.004, octaves: 2, rgbDelta: [4, 3, 2] }, grain: { frequency: 0.85, octaves: 1, amplitude: 1.5 } },
            {
                type: "circuitLattice",
                coordinateSpace: "warped",
                frequency: 0.017,
                octaves: 2,
                angle: 0.08,
                offset: [400, 1100],
                ridgeThreshold: 0.11,
                peak: 8,
                tint: [-1, -1, -1],
                grooveThreshold: 0.17,
                groovePeak: 3,
                grooveTint: [-2, -2, -3],
                intersectionThreshold: 0.12,
                intersectionPeak: 12,
                intersectionTint: [0.45, 0.95, 1.25],
                interiorVariation: { frequency: 0.06, amplitude: 1, tint: [1, 1, 0] },
                blendMode: "add",
                opacity: 0.55,
            },
            {
                type: "deckPlates",
                cellWorldSize: 16,
                plateCells: 2,
                groutWidth: 0.05,
                groutPeak: 8,
                groutTint: [-5, -5, -4],
                plateVariation: 2.5,
                jitterOffset: [300, 900],
                rivetSpacing: 0,
                blendMode: "multiply",
                opacity: 0.62,
            },
            { type: "wallLighting", power: 1.05, topDarken: 6, coolBias: 1.03, surfaceMask: "wall" },
        ],
    },

    rootForest: {
        warp: { frequency: 0.003, amplitude: 14, octaves: 3, sampleOffset: [900, 200] },
        palette: { base: [18, 22, 16], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "baseMetal", structure: { frequency: 0.003, octaves: 2, rgbDelta: [3, 5, 2] }, grain: { frequency: 0.55, octaves: 1, amplitude: 3 } },
            {
                type: "circuitLattice",
                coordinateSpace: "warped",
                frequency: 0.014,
                octaves: 2,
                angle: 0.4,
                offset: [700, 200],
                ridgeThreshold: 0.12,
                peak: 14,
                tint: [0.15, 0.95, 0.3],
                intersectionThreshold: 0.13,
                intersectionPeak: 11,
                intersectionTint: [0.1, 1.35, 0.45],
                interiorVariation: { frequency: 0.05, amplitude: 2, tint: [1, 3, 1] },
            },
        ],
    },

    cyberWeave: {
        warp: { frequency: 0.008, amplitude: 6, octaves: 2, sampleOffset: [120, 340] },
        palette: { base: [15, 18, 22], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "celticWeave", coordinateSpace: "warped", gridSize: 32, pipeWidth: 5, peak: 12, tint: [0.1, 0.8, 1.2], opacity: 0.85 },
            { type: "circuitTraces", coordinateSpace: "warped", gridSize: 16, lineWidth: 1.5, density: 0.6, diagDensity: 0.2, peak: 10, tint: [1.2, 0.3, 0.8], opacity: 0.7 },
        ],
    },

    alienHive: {
        warp: { frequency: 0.004, amplitude: 18, octaves: 3, sampleOffset: [800, 100] },
        palette: { base: [12, 10, 14], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "topoContours", coordinateSpace: "warped", frequency: 0.012, bands: 14, thickness: 0.15, peak: 8, tint: [0.4, 0.9, 0.2], opacity: 0.9 },
            { type: "concentricRings", coordinateSpace: "warped", frequency: 0.02, ringWidth: 0.1, peak: 10, tint: [0.8, 0.1, 0.5], opacity: 0.6 },
        ],
    },

    holoDeck: {
        warp: { frequency: 0.001, amplitude: 2, octaves: 1, sampleOffset: [0, 0] },
        palette: { base: [5, 5, 8], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "circuitTraces", coordinateSpace: "warped", gridSize: 32, lineWidth: 2, density: 0.8, diagDensity: 0.4, peak: 14, tint: [0.2, 1.5, 1.5], opacity: 0.9 },
            { type: "topoContours", coordinateSpace: "eval", frequency: 0.005, bands: 8, thickness: 0.05, peak: 6, tint: [1.2, 0.2, 1.2], opacity: 0.5 },
        ],
    },

    plasmaCore: {
        warp: { frequency: 0.006, amplitude: 24, octaves: 2, sampleOffset: [500, 500] },
        palette: { base: [8, 12, 24], shadow: combatVisualSettings.floorShadow },
        motifs: [
            { type: "starburst", coordinateSpace: "warped", gridSize: 64, density: 0.4, radius: 48, spikes: 12, peak: 18, tint: [0.5, 1.2, 2.0], opacity: 0.95 },
            { type: "circuitLattice", coordinateSpace: "warped", frequency: 0.02, octaves: 2, angle: 0.5, ridgeThreshold: 0.1, peak: 8, tint: [0.2, 0.5, 1.5], opacity: 0.4 },
        ],
    },

    tetris: {
        warp: { frequency: 0.009, amplitude: 24, octaves: 2, sampleOffset: [500, 500] },
        palette: { base: [8, 12, 24], floorBase: [5, 18, 35], wallBase: [5, 18, 35], shadow: "#12161c" },
        motifs: [
            {
                type: "circuitPanels",
                coordinateSpace: "warped",
                gridSize: 16,
                density: 0.35,
                cellVariation: 3,
                groutWidth: 0.06,
                groutPeak: -12,
                groutTint: [1, 1, 1],
                bevelWidth: 0.05,
                highlightPeak: 5,
                shadowPeak: -4,
                bevelTint: [1, 1, 1],
                rivetRadius: 0.1,
                rivetSpacing: 0.16,
                rivetPeak: 5,
                rivetTint: [0.5, 1.0, 2.5],
                blendMode: "add",
                opacity: 1,
            },
            { type: "starburst", coordinateSpace: "warped", gridSize: 16, density: 0.35, radius: 33, spikes: 2, peak: 18, tint: [-0.4, 1.4, 2.3], opacity: 1 },
            { type: "circuitLattice", coordinateSpace: "warped", frequency: 0.02, octaves: 2, angle: 0.5, ridgeThreshold: 0.1, peak: 8, tint: [0.2, 0.5, 1.5], opacity: 0.4 },
        ],
    },

    ancientRuins: {
        warp: { frequency: 0.002, amplitude: 5, octaves: 2, sampleOffset: [200, 900] },
        palette: { base: [30, 26, 22], floorBase: [20, 22, 26], wallBase: [24, 26, 30], shadow: "#12161c" },
        animation: { targetPath: "motifs[3].hueShift", startValue: -180, endValue: 180, frames: 30, durationMs: 4000 },
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
            { type: "filterHSV", hueShift: -180, saturation: 2.6, value: 0.1, blendMode: "add", opacity: 1, surfaceMask: "all" },
            { type: "fractalCracks", frequency: 0.012, octaves: 4, threshold: 0.43, peak: 15, tint: [0.4, -4.3, -4.9], surfaceMask: "all", blendMode: "hard-light", opacity: 0.95 },
            { type: "celticWeave", coordinateSpace: "warped", gridSize: 48, pipeWidth: 6, peak: 5, tint: [0.4, 0.3, 0.2], surfaceMask: "all", blendMode: "add", opacity: 0.5 },
            { type: "filterLevels", blackPoint: 49, whitePoint: 255, gamma: 0.8, surfaceMask: "all", blendMode: "replace", opacity: 1 },
        ],
    },

    neonPulse: {
        warp: { frequency: 0.008, amplitude: 20, octaves: 2, sampleOffset: [300, 300] },
        palette: { base: [5, 12, 28], floorBase: [5, 12, 28], wallBase: [22, 5, 28], shadow: "#080c14" },
        motifs: [
            {
                type: "circuitPanels",
                coordinateSpace: "warped",
                gridSize: 16,
                density: 0.3,
                cellVariation: 3,
                groutWidth: 0.06,
                groutPeak: -12,
                groutTint: [1, 1, 1],
                bevelWidth: 0.05,
                highlightPeak: 5,
                shadowPeak: -4,
                bevelTint: [1, 1, 1],
                rivetRadius: 0.1,
                rivetSpacing: 0.16,
                rivetPeak: 5,
                rivetTint: [0.5, 1.0, 2.5],
                blendMode: "add",
                opacity: 1,
            },
            { type: "starburst", coordinateSpace: "warped", gridSize: 16, density: 0.3, radius: 30, spikes: 2, peak: 16, tint: [2.5, 0.8, -0.4], opacity: 1 },
            { type: "circuitLattice", coordinateSpace: "warped", frequency: 0.025, octaves: 2, angle: 0.1, ridgeThreshold: 0.1, peak: 7, tint: [1.8, 0.2, 0.6], opacity: 0.5 },
        ],
    },

    acidCore: {
        warp: { frequency: 0.01, amplitude: 22, octaves: 2, sampleOffset: [700, 150] },
        palette: { base: [8, 16, 12], floorBase: [8, 16, 12], wallBase: [6, 10, 24], shadow: "#060a08" },
        motifs: [
            { type: "starburst", coordinateSpace: "warped", gridSize: 12, density: 0.25, radius: 28, spikes: 3, peak: 18, tint: [-0.5, 2.5, 0.5], opacity: 1 },
            { type: "circuitLattice", coordinateSpace: "warped", frequency: 0.03, octaves: 2, angle: 0.8, ridgeThreshold: 0.08, peak: 9, tint: [-0.2, 1.8, 1.2], opacity: 0.45 },
        ],
    },

    solarFlare: {
        warp: { frequency: 0.0075, amplitude: 26, octaves: 2, sampleOffset: [100, 900] },
        palette: { base: [22, 12, 6], floorBase: [22, 12, 6], wallBase: [12, 18, 10], shadow: "#120804" },
        motifs: [
            { type: "starburst", coordinateSpace: "warped", gridSize: 20, density: 0.4, radius: 35, spikes: 4, peak: 20, tint: [2.5, 1.6, -0.6], opacity: 1 },
            { type: "circuitLattice", coordinateSpace: "warped", frequency: 0.018, octaves: 2, angle: 0.35, ridgeThreshold: 0.11, peak: 8, tint: [1.8, 0.6, 0.1], opacity: 0.4 },
        ],
    },
};

const startStation = "ancientRuins";

export const defaultFloorProceduralProfileId = startStation;

/** Layer-0 / start node floor look (independent of generator strategy). */
export const startFloorProceduralProfileId = startStation;

/** Generator strategy name → floor profile id */
export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: startStation,
    MazeStrategy: "cargoBay",
    Maze2Strategy: "cargoBay",
    DenseMazeStrategy: "cargoBay",
    SquareStrategy: "cargoBay",
    GeometricStrategy: "techCorridor",
    FortressStrategy: "techCorridor",
    HoneycombStrategy: "rootForest",
    DiamondStrategy: "rootForest",
};

/** @type {Record<string, object>} */
const runtimeFloorProfiles = {};

/**
 * Register a runtime-only floor profile (dev tools, A/B overlays).
 * Checked before shipped profiles in getFloorProceduralProfile.
 */
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

/** Shipped profile ids only (excludes runtime/dev overlays). */
export function listShippedFloorProfileIds() {
    return Object.keys(floorProceduralProfiles).sort();
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
