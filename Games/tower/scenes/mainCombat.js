import { skipClueSearch } from "./skipState.js";

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneDefinition} */
export const mainCombatScene = {
    id: "main_combat",
    phase: "combat",
    spawn: "corridor",
    skipState: skipClueSearch,
    completeWhen() {
        return false;
    },
};
