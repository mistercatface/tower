import { combatVisualSettings } from "./Config.js";

/** @typedef {"eval" | "warped"} ProceduralCoordinateSpace */

/** Ancient glowing ruins with pulsing light networks and cracked energy channels. */
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
        frames: 100,
        durationMs: 15800,
        tracks: [
            { targetPath: "motifs[3].hueShift", startValue: -180, endValue: 180 },
            { targetPath: "motifs[2].gridSize", startValue: 8, endValue: 80 },
        ],
    },
};

/** Shifting neon cyberspace network with multiple grid-scale animations. */
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
        frames: 35,
        durationMs: 2500,
        tracks: [
            { targetPath: "motifs[2].gridSize", startValue: 12, endValue: 48 },
            { targetPath: "motifs[3].hueShift", startValue: 0, endValue: 360 }
        ]
    }
};

/** High-intensity magma forge with expanding hot-spots and cycling thermal bands. */
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
        frames: 40,
        durationMs: 3000,
        tracks: [
            { targetPath: "motifs[1].radius", startValue: 8, endValue: 32 },
            { targetPath: "motifs[3].bands", startValue: 4, endValue: 16 }
        ]
    }
};

/** Bioluminescent organic deck pulsing with shifting light frequencies. */
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
        frames: 30,
        durationMs: 2000,
        tracks: [
            { targetPath: "motifs[1].frequency", startValue: 0.015, endValue: 0.065 },
            { targetPath: "motifs[3].hueShift", startValue: -60, endValue: 60 }
        ]
    }
};

export const floorProceduralProfiles = {
    ancientRuins,
    cyberGrid,
    magmaFlow,
    organicPulse
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