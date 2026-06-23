/** Library baseline — games override via `gameDefinition.physicsSettings`. */
/** @typedef {typeof LIBRARY_PHYSICS_DEFAULTS} LibraryPhysicsSettings */
export const LIBRARY_PHYSICS_DEFAULTS = {
    groundNavRoll: { maxSpeed: 180, accel: 600, stopRadius: 6 },
    groundNavHpa: { stopRadius: 8, pathWaypointArrivalMin: 12, pathWaypointArrivalRadiusFactor: 1.5 },
};
export const physicsSettings = structuredClone(LIBRARY_PHYSICS_DEFAULTS);
