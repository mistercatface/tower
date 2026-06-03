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
};

export const START_STATION_ID = "decayedStation";

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

// Custom dynamic profiles loaded from TileLabStorage in the UI
const customFloorProfiles = {};

export function registerRuntimeFloorProfile(profileId, profile) {
    runtimeFloorProfiles[profileId] = profile;
}

export function unregisterRuntimeFloorProfile(profileId) {
    delete runtimeFloorProfiles[profileId];
}

// Dynamically registers profiles scanned from local disk (FSA API in TileLab)
export function registerCustomFloorProfile(profileId, profile) {
    customFloorProfiles[profileId] = profile;
}

export function unregisterCustomFloorProfile(profileId) {
    delete customFloorProfiles[profileId];
}

export function getFloorProceduralProfile(profileId) {
    const profile = runtimeFloorProfiles[profileId] ?? customFloorProfiles[profileId] ?? floorProceduralProfiles[profileId];
    if (!profile) {
        throw new Error(`Unknown floor procedural profile: ${profileId}`);
    }
    return profile;
}

export function listShippedFloorProfileIds() {
    return Object.keys(floorProceduralProfiles);
}

export function listAllFloorProfileIds() {
    const shipped = listShippedFloorProfileIds();
    const customs = Object.keys(customFloorProfiles);
    const unique = new Set([...shipped, ...customs]);
    return Array.from(unique);
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