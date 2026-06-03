import cyberGrid from "./TileLabStorage/cyberGrid.js";
import toxicSludge from "./TileLabStorage/toxicSludge.js";
import neonWireframe from "./TileLabStorage/neonWireframe.js";
import shatteredDimension from "./TileLabStorage/shatteredDimension.js";
import pulseRings from "./TileLabStorage/pulseRings.js";
import emberLattice from "./TileLabStorage/emberLattice.js";
import synthWeave from "./TileLabStorage/synthWeave.js";
import auroraBurst from "./TileLabStorage/auroraBurst.js";
import shatteredCircuitry from "./TileLabStorage/shatteredCircuitry.js";
import chronoVortex from "./TileLabStorage/chronoVortex.js";
import cyberPulse from "./TileLabStorage/cyberPulse.js";
import decayedStation from "./TileLabStorage/decayedStation.js";
import circuitLoop from "./TileLabStorage/circuitLoop.js";

export const floorProceduralProfiles = {
    cyberGrid,
    toxicSludge,
    neonWireframe,
    shatteredDimension,
    pulseRings,
    emberLattice,
    synthWeave,
    auroraBurst,
    shatteredCircuitry,
    chronoVortex,
    cyberPulse,
    decayedStation,
    circuitLoop,
};

export const START_STATION_ID = "shatteredCircuitry";

export const defaultFloorProceduralProfileId = START_STATION_ID;

export const startFloorProceduralProfileId = START_STATION_ID;

export const floorProceduralProfileByStrategy = {
    StartBuildingStrategy: START_STATION_ID,
    MazeStrategy: START_STATION_ID,
    Maze2Strategy: START_STATION_ID,
    DenseMazeStrategy: START_STATION_ID,
    SquareStrategy: START_STATION_ID,
    GeometricStrategy: START_STATION_ID,
    FortressStrategy: START_STATION_ID,
    HoneycombStrategy: START_STATION_ID,
    DiamondStrategy: START_STATION_ID,
};

const runtimeFloorProfiles = {};

/** Tile Lab live editor profile (`__labA__`), not persisted to disk. */
export function registerRuntimeFloorProfile(profileId, profile) {
    runtimeFloorProfiles[profileId] = profile;
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