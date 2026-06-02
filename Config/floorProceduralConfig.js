import { combatVisualSettings } from "./Config.js";

/** @typedef {"eval" | "warped"} ProceduralCoordinateSpace */

/** Station deck — grid plates + subtle grain; accents kept very light. */
const spaceStation = {
    warp: {
        frequency: 0.005,
        amplitude: 0,
        octaves: 1,
        sampleOffset: [0, 0],
    },
    palette: {
        base: [22, 24, 28],
        floorBase: [20, 22, 26],
        wallBase: [24, 26, 30],
        shadow: combatVisualSettings.floorShadow,
    },
    underlay: [
        {
            type: "baseMetal",
            structure: { frequency: 0.0025, octaves: 1, rgbDelta: [3, 3, 4] },
            grain: { frequency: 0.18, octaves: 1, amplitude: 1 },
        },
    ],
    structure: [
        {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 2,
            groutWidth: 0.045,
            groutPeak: 11,
            groutTint: [-6, -6, -5],
            plateVariation: 3,
            jitterOffset: [40, 120],
            rivetSpacing: 16,
            rivetInset: 4,
            rivetRadius: 0.018,
            rivetPeak: 5,
            rivetTint: [2, 4, 5],
            blendMode: "multiply",
            opacity: 0.85,
        },
    ],
    floorMotifs: [],
    wallMotifs: [
        {
            type: "deckPlates",
            cellWorldSize: 16,
            plateCells: 1,
            plateRows: 2,
            groutWidth: 0.05,
            groutPeak: 9,
            groutTint: [-5, -5, -4],
            plateVariation: 2,
            jitterOffset: [80, 20],
            rivetSpacing: 0,
            blendMode: "multiply",
            opacity: 0.75,
        },
        {
            type: "wallLighting",
            power: 1,
            topDarken: 4,
            coolBias: 1.04,
        },
    ],
    accents: [
        {
            type: "stainBlotch",
            coordinateSpace: "eval",
            frequency: 0.008,
            threshold: 0.55,
            peak: 5,
            offset: [200, 500],
            tint: [1, 2, 2],
            octaves: 1,
            opacity: 0.15,
            blendMode: "add",
        },
    ],
};

/**
 * Procedural floor/wall texture profiles. Add motifs here to change the look;
 * implement new motif types under Procedural/Motifs/.
 */
export const floorProceduralProfiles = {
    spaceStation,
    cleanserStation: spaceStation,
    startStation: spaceStation,

    cargoBay: {
        warp: {
            frequency: 0.004,
            amplitude: 8,
            octaves: 2,
            sampleOffset: [300, 700],
        },
        palette: {
            base: [27, 25, 22],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "baseMetal",
                structure: { frequency: 0.004, octaves: 2, rgbDelta: [4, 3, 2] },
                grain: { frequency: 1.0, octaves: 1, amplitude: 2 },
            },
            {
                type: "circuitLattice",
                coordinateSpace: "warped",
                frequency: 0.017,
                octaves: 2,
                angle: 0.08,
                offset: [400, 1100],
                ridgeThreshold: 0.11,
                peak: 8,
                tint: [-2, -2, -2],
                grooveThreshold: 0.17,
                groovePeak: 4,
                grooveTint: [-2, -2, -3],
                intersectionThreshold: 0.12,
                intersectionPeak: 13,
                intersectionTint: [0.45, 0.95, 1.25],
                interiorVariation: { frequency: 0.06, amplitude: 1.2, tint: [1, 1, 0] },
            },
        ],
    },

    rootForest: {
        warp: {
            frequency: 0.003,
            amplitude: 14,
            octaves: 3,
            sampleOffset: [900, 200],
        },
        palette: {
            base: [18, 22, 16],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "baseMetal",
                structure: { frequency: 0.003, octaves: 2, rgbDelta: [3, 5, 2] },
                grain: { frequency: 0.55, octaves: 1, amplitude: 3 },
            },
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
};

export const defaultFloorProceduralProfileId = "spaceStation";

/** Layer-0 / start node floor look (independent of generator strategy). */
export const startFloorProceduralProfileId = "spaceStation";

/** Generator strategy name → floor profile id */
export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: "spaceStation",
    MazeStrategy: "cargoBay",
    Maze2Strategy: "cargoBay",
    DenseMazeStrategy: "cargoBay",
    SquareStrategy: "cargoBay",
    GeometricStrategy: "spaceStation",
    FortressStrategy: "spaceStation",
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
