/** @type {import("./GameDefinitionTypes.js").GameDefinition | null} */
let activeGameDefinition = null;

/** @param {import("./GameDefinitionTypes.js").GameDefinition} definition */
export function setActiveGameDefinition(definition) {
    activeGameDefinition = definition;
}

export function getActiveGameDefinition() {
    return activeGameDefinition;
}
