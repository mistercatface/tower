import { LIBRARY_COLLISION_DEFAULTS } from "../Libraries/Collision/collisionDefaults.js";
import { mergePartial } from "../Libraries/Config/mergePartial.js";
/** @type {typeof LIBRARY_COLLISION_DEFAULTS} */
let activeCollisionSettings = LIBRARY_COLLISION_DEFAULTS;
/** @returns {typeof LIBRARY_COLLISION_DEFAULTS} */
export function getCollisionSettings() {
    return activeCollisionSettings;
}
/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function applyGameCollisionSettings(definition) {
    activeCollisionSettings = mergePartial(LIBRARY_COLLISION_DEFAULTS, definition?.collisionSettings);
}
