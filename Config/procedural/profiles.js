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
export const runtimeSurfaceProfiles = {};
export function shippedSurfaceProfileIds() {
    return Object.keys(surfaceProceduralProfiles);
}
export function surfaceProfileKnown(profileId) {
    return Boolean(surfaceProceduralProfiles[profileId] ?? runtimeSurfaceProfiles[profileId]);
}
export function resolveSurfaceProfile(profileId) {
    const profile = runtimeSurfaceProfiles[profileId] ?? surfaceProceduralProfiles[profileId];
    if (!profile) throw new Error(`Unknown surface procedural profile: ${profileId}`);
    return profile;
}
export function registerRuntimeSurfaceProfile(profile) {
    runtimeSurfaceProfiles[profile.id] = profile;
}
