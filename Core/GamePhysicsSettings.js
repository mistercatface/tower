import { LIBRARY_PHYSICS_DEFAULTS } from "../Libraries/Motion/physicsDefaults.js";
import { mergePartial } from "../Libraries/Config/mergePartial.js";
let activePhysicsSettings = LIBRARY_PHYSICS_DEFAULTS;
export function getPhysicsSettings() {
    return activePhysicsSettings;
}
export function applyGamePhysicsSettings(definition) {
    activePhysicsSettings = mergePartial(LIBRARY_PHYSICS_DEFAULTS, definition?.physicsSettings);
}
