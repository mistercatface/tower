import { CLUE_SEARCH_KEYS } from "../tutorial/ClueSearch.js";

/** @param {object} state */
export function skipIntroGuards(state) {
    state.startGameIntroCompleted = true;
    state.startGameIntroActive = false;
    state.startGameIntroTriggered = true;
}

/** @param {object} state */
export function skipClueSearch(state) {
    skipIntroGuards(state);
    state.clueSearchCompleted = true;
    state.clueSearchActive = false;
    state.clueSearchFinishing = false;
    state.clueSearchSeen = new Set(CLUE_SEARCH_KEYS);
}
