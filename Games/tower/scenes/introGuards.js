import {
    beginStartGameIntro,
    updateStartGameIntro,
} from "../tutorial/StartGameIntro.js";
import { tryBeginClueSearchAfterIntroGuards } from "../tutorial/ClueSearch.js";
import { skipIntroGuards } from "./skipState.js";

/** @type {import("../../../Libraries/RunScene/compileRunScenes.js").RunSceneDefinition} */
export const introGuardsScene = {
    id: "intro_guards",
    phase: "combat",
    spawn: "yard",
    radios: ["start_game_guards", "intro_guards_cleared"],
    skipState: skipIntroGuards,
    enter: beginStartGameIntro,
    tick: updateStartGameIntro,
    onEnemyKilled({ enemy, state, fsm }) {
        if (enemy?.isIntroGuard) {
            tryBeginClueSearchAfterIntroGuards(state, fsm);
        }
    },
    completeWhen(state) {
        return state.clueSearchActive || state.clueSearchCompleted || state.clueSearchFinishing;
    },
};
