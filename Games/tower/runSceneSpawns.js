import { gridSettings } from "../../Config/Config.js";
import { getStartGameLayout } from "./tutorial/StartGameBuilding.js";

/**
 * @param {object} state
 * @returns {ReturnType<typeof getStartGameLayout>}
 */
export function getRunSceneLayout(state) {
    const mapNode = state.getStartMapNode();
    if (!mapNode) return null;
    const combatCoords = state.getNodeCombatCoords(mapNode);
    return getStartGameLayout(combatCoords.x, combatCoords.y, gridSettings.cellSize);
}

/**
 * Move the leader and sidekicks to a named layout spawn slot.
 * @param {object} state
 * @param {string} spawnSlot
 * @param {object} [ctx]
 */
export function applyRunSceneSpawn(state, spawnSlot, ctx = null) {
    const layout = getRunSceneLayout(state);
    const spawn = layout?.spawnSlots?.[spawnSlot];
    if (!spawn) return;

    state.player.setSpawnPosition(spawn.x, spawn.y);
    state.player.resetToSpawn();
    state.spawnRunParty();
    ctx?.viewport?.snapTo(state.player.x, state.player.y);
}
