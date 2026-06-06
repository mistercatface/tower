import { beginClueSearch } from "../tutorial/ClueSearch.js";
import { skipClueSearch } from "./skipState.js";

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneDefinition} */
export const clueSearchScene = {
    id: "clue_search",
    phase: "inspector",
    spawn: "foyer",
    radios: ["inspect:jacko_can", "inspect:wood_crate", "clue_search_complete"],
    skipState: skipClueSearch,
    enter(state, ctx) {
        if (state.clueSearchCompleted) return;
        if (!state.clueSearchActive) {
            beginClueSearch(state, () => {
                state.skipCombatEnterReset = true;
                ctx.fsm?.transition("combat");
            });
        }
    },
    completeWhen(state) {
        return state.clueSearchCompleted;
    },
};
