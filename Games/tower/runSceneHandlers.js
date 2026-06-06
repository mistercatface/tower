import {
    beginStartGameIntro,
    updateStartGameIntro,
} from "./tutorial/StartGameIntro.js";
import {
    beginClueSearch,
    tryBeginClueSearchAfterIntroGuards,
    CLUE_SEARCH_KEYS,
} from "./tutorial/ClueSearch.js";
import { applyRunScenePartyPosition } from "./runSceneSpawns.js";

function markIntroGuardsSkipped(state) {
    state.startGameIntroCompleted = true;
    state.startGameIntroActive = false;
    state.startGameIntroTriggered = true;
}

function markClueSearchSkipped(state) {
    markIntroGuardsSkipped(state);
    state.clueSearchCompleted = true;
    state.clueSearchActive = false;
    state.clueSearchFinishing = false;
    state.clueSearchSeen = new Set(CLUE_SEARCH_KEYS);
}

/** @returns {import("../../Libraries/RunScene/RunSceneController.js").RunSceneController["scenes"]} */
export function createRunSceneHandlers() {
    return [
        {
            id: "intro_guards",
            phase: "combat",
            onEnter(state, ctx) {
                applyRunScenePartyPosition(state, "intro_guards", ctx);
                beginStartGameIntro(state);
            },
            onSkip(state) {
                markIntroGuardsSkipped(state);
            },
            onTick(state) {
                updateStartGameIntro(state);
            },
            onEnemyKilled({ enemy, state, fsm }) {
                if (enemy?.isIntroGuard) {
                    tryBeginClueSearchAfterIntroGuards(state, fsm);
                }
            },
            isComplete(state) {
                return state.clueSearchActive || state.clueSearchCompleted || state.clueSearchFinishing;
            },
        },
        {
            id: "clue_search",
            phase: "inspector",
            onEnter(state, ctx) {
                applyRunScenePartyPosition(state, "clue_search", ctx);
                if (state.clueSearchCompleted) return;
                if (!state.clueSearchActive) {
                    beginClueSearch(state, () => {
                        state.skipCombatEnterReset = true;
                        ctx.fsm?.transition("combat");
                    });
                }
            },
            onSkip(state) {
                markClueSearchSkipped(state);
            },
            isComplete(state) {
                return state.clueSearchCompleted;
            },
        },
        {
            id: "main_combat",
            phase: "combat",
            onEnter(state, ctx) {
                applyRunScenePartyPosition(state, "main_combat", ctx);
            },
            onSkip(state) {
                markClueSearchSkipped(state);
            },
            isComplete() {
                return false;
            },
        },
    ];
}
