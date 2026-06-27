import { surfaceProceduralProfiles } from "../../Config/procedural/profiles.js";
export { surfaceProceduralProfiles as surfaceProfiles };
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
