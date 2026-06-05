import { EventBus } from "../Libraries/Events/EventBus.js";
import { Events } from "./EventNames.js";

export const events = new EventBus();

export function requestUiUpdate() {
    events.emit(Events.UI_UPDATE);
}

export function requestUiHudUpdate() {
    events.emit(Events.UI_UPDATE_HUD);
}

export function spawnFloatingText(data) {
    events.emit(Events.FX_FLOATING_TEXT, data);
}

export function requestProgressDirty() {
    events.emit(Events.PROGRESS_DIRTY);
}

export function requestProgressSave() {
    events.emit(Events.PROGRESS_SAVE);
}

export function emitCombatEnemyKilled(enemy) {
    events.emit(Events.COMBAT_ENEMY_KILLED, { enemy });
}

export function emitCombatWaveCleared() {
    events.emit(Events.COMBAT_WAVE_CLEARED);
}

export function requestGamePause(reason) {
    events.emit(Events.GAME_PAUSE, { reason });
}

export function requestGameResume(reason) {
    events.emit(Events.GAME_RESUME, { reason });
}

export function toggleGamePause() {
    events.emit(Events.GAME_TOGGLE_PAUSE);
}

export function emitPurchaseUpgrade(upgradeId) {
    events.emit(Events.PROGRESS_PURCHASE_UPGRADE, { upgradeId });
}

export function emitToggleAbility(abilityId) {
    events.emit(Events.PROGRESS_TOGGLE_ABILITY, { abilityId });
}

export function emitToggleEquipWeapon(gunId) {
    events.emit(Events.PROGRESS_EQUIP_WEAPON, { gunId });
}

export function emitUnequipWeaponSlot(slotIndex) {
    events.emit(Events.PROGRESS_UNEQUIP_WEAPON_SLOT, { slotIndex });
}

export function emitSetUpgradeTab(tab) {
    events.emit(Events.UI_SET_UPGRADE_TAB, { tab });
}

export function emitSetStatsSubTab(subTab) {
    events.emit(Events.UI_SET_STATS_SUB_TAB, { subTab });
}

export function adjustGameSpeed(delta) {
    events.emit(Events.GAME_SET_SPEED, { delta });
}

export function setGameZoomFromSlider(sliderValue) {
    events.emit(Events.GAME_SET_ZOOM, { sliderValue });
}

export function adjustGameZoom(delta) {
    events.emit(Events.GAME_ADJUST_ZOOM, { delta });
}

export function setGameZoomAbsolute(zoom) {
    events.emit(Events.GAME_SET_ZOOM_ABSOLUTE, { zoom });
}

export function emitMapRequestTravel(nodeId) {
    events.emit(Events.MAP_REQUEST_TRAVEL, { nodeId });
}

export function emitMapContinueAfterSector() {
    events.emit(Events.MAP_CONTINUE_AFTER_SECTOR);
}

export function emitMapToggle() {
    events.emit(Events.MAP_TOGGLE);
}

export function showNodeConfirmModal(node) {
    events.emit(Events.UI_SHOW_NODE_CONFIRM, { node });
}

export function showSectorClearedModal(node, rewardText) {
    events.emit(Events.UI_SHOW_SECTOR_CLEARED, { node, rewardText });
}

export function emitHardReset() {
    events.emit(Events.PROGRESS_HARD_RESET);
}

export function showGameOver() {
    events.emit(Events.UI_SHOW_GAME_OVER);
}

export function hideGameOver() {
    events.emit(Events.UI_HIDE_GAME_OVER);
}

export function emitGameRestart() {
    events.emit(Events.GAME_RESTART);
}

export function startRadioConversation(conversationId, onComplete, state, { force = false } = {}) {
    events.emit(Events.RADIO_START, {
        conversationId,
        onComplete,
        state: state ?? events.getContext()?.state,
        force,
    });
}

export function fireRadioTrigger(trigger, onComplete, state) {
    events.emit(Events.RADIO_TRIGGER, {
        trigger,
        onComplete,
        state: state ?? events.getContext()?.state,
    });
}

export function advanceRadioLine() {
    events.emit(Events.RADIO_ADVANCE);
}

export function endRadioConversation() {
    events.emit(Events.RADIO_END);
}

export { Events } from "./EventNames.js";
