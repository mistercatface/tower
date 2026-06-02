import { combatVisualSettings } from "./Config.js";

/** @typedef {"eval" | "warped"} ProceduralCoordinateSpace */

/** Station deck — grid plates + continuous warped vein field (floor→wall). */
const spaceStation = {
    warp: {
        frequency: 0.004,
        amplitude: 9,
        octaves: 2,
        sampleOffset: [120, 480],
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
            structure: { frequency: 0.0025, octaves: 2, rgbDelta: [3, 3, 4] },
            grain: { frequency: 0.18, octaves: 1, amplitude: 1 },
        },
    ],
    sharedMotifs: [
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
    ],
    structure: [
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
    ],
    floorMotifs: [],
    wallMotifs: [
        {
            type: "wallLighting",
            power: 1,
            topDarken: 5,
            coolBias: 1.04,
        },
    ],
    accents: [],
};

/** Clinical sci-fi corridor — deck plates + unified warped veins (rootForest-style cohesion). */
const techCorridor = {
    warp: {
        frequency: 0.0035,
        amplitude: 11,
        octaves: 2,
        sampleOffset: [400, 800],
    },
    palette: {
        base: [34, 36, 40],
        floorBase: [36, 38, 42],
        wallBase: [38, 40, 44],
        shadow: combatVisualSettings.floorShadow,
    },
    underlay: [
        {
            type: "baseMetal",
            structure: { frequency: 0.002, octaves: 2, rgbDelta: [1, 1, 2] },
            grain: { frequency: 0.15, octaves: 1, amplitude: 0.35 },
        },
    ],
    sharedMotifs: [
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
    ],
    structure: [
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
    ],
    floorMotifs: [],
    wallMotifs: [
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
        {
            type: "wallLighting",
            power: 0.95,
            topDarken: 3,
            coolBias: 1.02,
        },
    ],
    accents: [],
};

/**
 * Procedural floor/wall texture profiles. Add motifs here to change the look;
 * implement new motif types under Procedural/Motifs/.
 */
export const floorProceduralProfiles = {
    spaceStation,
    techCorridor,
    cleanserStation: spaceStation,
    startStation: spaceStation,

    cargoBay: {
        warp: {
            frequency: 0.004,
            amplitude: 10,
            octaves: 2,
            sampleOffset: [300, 700],
        },
        palette: {
            base: [27, 25, 22],
            floorBase: [28, 26, 23],
            wallBase: [25, 23, 20],
            shadow: combatVisualSettings.floorShadow,
        },
        underlay: [
            {
                type: "baseMetal",
                structure: { frequency: 0.004, octaves: 2, rgbDelta: [4, 3, 2] },
                grain: { frequency: 0.85, octaves: 1, amplitude: 1.5 },
            },
        ],
        sharedMotifs: [
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
        ],
        structure: [
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
        ],
        wallMotifs: [
            {
                type: "wallLighting",
                power: 1.05,
                topDarken: 6,
                coolBias: 1.03,
            },
        ],
        accents: [],
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

    cyberWeave: {
        warp: { frequency: 0.008, amplitude: 6, octaves: 2, sampleOffset: [120, 340] },
        palette: {
            base: [15, 18, 22],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "celticWeave", coordinateSpace: "warped",
                gridSize: 32, pipeWidth: 5, peak: 12, tint: [0.1, 0.8, 1.2], opacity: 0.85
            },
            {
                type: "circuitTraces", coordinateSpace: "warped",
                gridSize: 16, lineWidth: 1.5, density: 0.6, diagDensity: 0.2, peak: 10, tint: [1.2, 0.3, 0.8], opacity: 0.7
            }
        ]
    },

    alienHive: {
        warp: { frequency: 0.004, amplitude: 18, octaves: 3, sampleOffset: [800, 100] },
        palette: {
            base: [12, 10, 14],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "topoContours", coordinateSpace: "warped",
                frequency: 0.012, bands: 14, thickness: 0.15, peak: 8, tint: [0.4, 0.9, 0.2], opacity: 0.9
            },
            {
                type: "concentricRings", coordinateSpace: "warped",
                frequency: 0.02, ringWidth: 0.1, peak: 10, tint: [0.8, 0.1, 0.5], opacity: 0.6
            }
        ]
    },

    holoDeck: {
        warp: { frequency: 0.001, amplitude: 2, octaves: 1, sampleOffset: [0, 0] },
        palette: {
            base: [5, 5, 8],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "circuitTraces", coordinateSpace: "warped",
                gridSize: 32, lineWidth: 2, density: 0.8, diagDensity: 0.4, peak: 14, tint: [0.2, 1.5, 1.5], opacity: 0.9
            },
            {
                type: "topoContours", coordinateSpace: "eval",
                frequency: 0.005, bands: 8, thickness: 0.05, peak: 6, tint: [1.2, 0.2, 1.2], opacity: 0.5
            }
        ]
    },

    plasmaCore: {
        warp: { frequency: 0.006, amplitude: 24, octaves: 2, sampleOffset: [500, 500] },
        palette: {
            base: [8, 12, 24],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "starburst", coordinateSpace: "warped",
                gridSize: 64, density: 0.4, radius: 48, spikes: 12, peak: 18, tint: [0.5, 1.2, 2.0], opacity: 0.95
            },
            {
                type: "circuitLattice", coordinateSpace: "warped",
                frequency: 0.02, octaves: 2, angle: 0.5, ridgeThreshold: 0.1, peak: 8, tint: [0.2, 0.5, 1.5], opacity: 0.4
            }
        ]
    },

    ancientRuins: {
        warp: { frequency: 0.002, amplitude: 5, octaves: 2, sampleOffset: [200, 900] },
        palette: {
            base: [30, 26, 22],
            shadow: combatVisualSettings.floorShadow,
        },
        motifs: [
            {
                type: "baseMetal",
                structure: { frequency: 0.005, octaves: 2, rgbDelta: [4, 3, 2] },
                grain: { frequency: 0.5, octaves: 1, amplitude: 2 }
            },
            {
                type: "hexGrid",
                cellWorldSize: 24, groutWidth: 0.1, groutPeak: 12, groutTint: [-4, -3, -2], cellVariation: 3, opacity: 0.8, blendMode: "multiply"
            },
            {
                type: "celticWeave", coordinateSpace: "warped",
                gridSize: 48, pipeWidth: 6, peak: 5, tint: [0.4, 0.3, 0.2], opacity: 0.5
            }
        ]
    },
};

export const defaultFloorProceduralProfileId = "techCorridor";

/** Layer-0 / start node floor look (independent of generator strategy). */
export const startFloorProceduralProfileId = "techCorridor";

/** Generator strategy name → floor profile id */
export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: "techCorridor",
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
