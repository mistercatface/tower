import { gridSettings, debugSkipToClueSearch } from "../../Config/Config.js";
import { isInspector } from "../../GameState/GamePhase.js";
import { getStartGameLayout } from "./tutorial/StartGameBuilding.js";
import { beginStartGameIntro, shouldRunStartGameIntro, updateStartGameIntro } from "./tutorial/StartGameIntro.js";
import { beginClueSearch, findClueSearchPickup, getClueSearchMissionLabel, shouldRunClueSearch, tryBeginClueSearchAfterIntroGuards } from "./tutorial/ClueSearch.js";

/** @param {import("../../GameState/GameStateMachine.js").GameStateMachineContext} ctx */
export function onCombatEnter(ctx) {
    const { state } = ctx;
    const mapNode = state.getStartMapNode();
    if (!mapNode) return;

    const combatCoords = state.getNodeCombatCoords(mapNode);
    const layout = getStartGameLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
    state.player.setSpawnPosition(layout.spawnX, layout.spawnY);
    state.player.resetToSpawn();
    state.spawnRunParty();

    if (shouldRunStartGameIntro(state)) beginStartGameIntro(state);

    if (debugSkipToClueSearch && shouldRunClueSearch(state)) {
        beginClueSearch(state, null);
        requestAnimationFrame(() => {
            if (shouldRunClueSearch(state)) ctx.fsm?.transition("inspector");
        });
    }
}

export function onCombatTick(state) {
    updateStartGameIntro(state);
}

export function onCombatEnemyKilled({ enemy, state, fsm }) {
    if (enemy?.isIntroGuard) tryBeginClueSearchAfterIntroGuards(state, fsm);
}

export function canRunHordeSpawning(state) {
    return !state.startGameIntroActive && !state.clueSearchActive && state.clueSearchCompleted;
}

export function getInspectMissionBanner(state) {
    const show = isInspector(state.phase) && state.clueSearchActive;
    return { show, text: show ? getClueSearchMissionLabel(state) : "" };
}

export function findInspectorInspectPickup(state, worldX, worldY) {
    return findClueSearchPickup(state, worldX, worldY);
}
