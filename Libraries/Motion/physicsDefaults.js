/** Library baseline — games override via `gameDefinition.physicsSettings`. */
import { mergeObjectTree } from "../Config/mergePartial.js";
/** @typedef {typeof LIBRARY_PHYSICS_DEFAULTS} LibraryPhysicsSettings */
export const LIBRARY_PHYSICS_DEFAULTS = {
    groundNavRoll: { maxSpeed: 180, accel: 600, stopRadius: 6 },
    groundNavHpa: { stopRadius: 8, pathWaypointArrivalMin: 12, pathWaypointArrivalRadiusFactor: 1.5 },
};
let activePhysicsSettings = LIBRARY_PHYSICS_DEFAULTS;
export function getPhysicsSettings() {
    return activePhysicsSettings;
}
export function applyGamePhysicsSettings(definition) {
    activePhysicsSettings = mergeObjectTree(LIBRARY_PHYSICS_DEFAULTS, definition?.physicsSettings);
}
