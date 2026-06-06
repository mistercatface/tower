import { getSurfaceProfileProvider } from "../../Libraries/Procedural/SurfaceProfileProvider.js";
import { resolveActiveSurfaceProfileId } from "../../Core/GameProceduralDesign.js";
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
import poolTableFelt from "./storage/poolTableFelt.js";
export const surfaceProceduralProfiles = {
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
    poolTableFelt,
};
/** Tile Lab live editor profile (`__labA__`), not persisted to disk. */
export function registerRuntimeSurfaceProfile(profileId, profile) {
    getSurfaceProfileProvider().registerRuntime(profileId, profile);
}
export function getSurfaceProceduralProfile(profileId) {
    return getSurfaceProfileProvider().getProfile(profileId);
}
export function listShippedSurfaceProfileIds() {
    return getSurfaceProfileProvider().listShippedIds();
}
export function resolveSurfaceProfileId(args) {
    return resolveActiveSurfaceProfileId(args);
}
