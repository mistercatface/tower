/** @type {import("../Games/tower/gameDefinition.js").GameDefinition | null} */
let activeGameDefinition = null;

/** @param {import("../Games/tower/gameDefinition.js").GameDefinition} definition */
export function setActiveGameDefinition(definition) {
    activeGameDefinition = definition;
}

export function getActiveGameDefinition() {
    return activeGameDefinition;
}
