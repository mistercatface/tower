import { getFloorProfileProvider } from "../../Libraries/Procedural/FloorProfileProvider.js";
import cyberGrid from "./storage/cyberGrid.js";
import toxicSludge from "./storage/toxicSludge.js";
import neonWireframe from "./storage/neonWireframe.js";
import shatteredDimension from "./storage/shatteredDimension.js";
import pulseRings from "./storage/pulseRings.js";
import emberLattice from "./storage/emberLattice.js";
import synthWeave from "./storage/synthWeave.js";
import auroraBurst from "./storage/auroraBurst.js";
import shatteredCircuitry from "./storage/shatteredCircuitry.js";
import organicShip from "./storage/organicShip.js";
import chronoVortex from "./storage/chronoVortex.js";
import cyberPulse from "./storage/cyberPulse.js";
import decayedStation from "./storage/decayedStation.js";
import circuitLoop from "./storage/circuitLoop.js";
import tomatoGarden from "./storage/tomatoGarden.js";
import neonOrchard from "./storage/neonOrchard.js";
import pumpkinPatch from "./storage/pumpkinPatch.js";

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
    organicShip,
    chronoVortex,
    cyberPulse,
    decayedStation,
    circuitLoop,
    tomatoGarden,
};

export const START_STATION_ID = "tomatoGarden";

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

/** Tile Lab live editor profile (`__labA__`), not persisted to disk. */
export function registerRuntimeFloorProfile(profileId, profile) {
    getFloorProfileProvider().registerRuntime(profileId, profile);
}

export function getFloorProceduralProfile(profileId) {
    return getFloorProfileProvider().getProfile(profileId);
}

export function listShippedFloorProfileIds() {
    return getFloorProfileProvider().listShippedIds();
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