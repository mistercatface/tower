import { engineCollisionSettings } from "../Config/balance/collision.js";
import { mergePartial } from "../Libraries/Config/mergePartial.js";

/** @type {typeof engineCollisionSettings} */
let activeCollisionSettings = engineCollisionSettings;

/** @returns {typeof engineCollisionSettings} */
export function getCollisionSettings() {
    return activeCollisionSettings;
}

/** @param {import("./GameDefinitionTypes.js").GameDefinition | null | undefined} definition */
export function applyGameCollisionSettings(definition) {
    activeCollisionSettings = mergePartial(engineCollisionSettings, definition?.collisionSettings);
}
