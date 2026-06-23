import { surfaceProceduralProfiles } from "../../Config/procedural/profiles.js";

export { surfaceProceduralProfiles as surfaceProfiles };

export const runtimeSurfaceProfiles = {};

export const surfaceProfileDefaults = { defaultId: "tomatoGarden" };

export function shippedSurfaceProfileIds() {
    return Object.keys(surfaceProceduralProfiles);
}

export function surfaceProfileKnown(profileId) {
    return Boolean(surfaceProceduralProfiles[profileId] ?? runtimeSurfaceProfiles[profileId]);
}

export function resolveSurfaceProfile(profileId) {
    const id = profileId ?? surfaceProfileDefaults.defaultId;
    const profile = runtimeSurfaceProfiles[id] ?? surfaceProceduralProfiles[id];
    if (!profile) throw new Error(`Unknown surface procedural profile: ${id}`);
    return profile;
}
