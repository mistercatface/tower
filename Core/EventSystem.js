import { Events } from "./EventNames.js";

class EventSystem {
    constructor() {
        this.listeners = new Map();
        this.context = null;
        this.warnOnMissingListeners = false;
    }

    setContext(ctx) {
        this.context = ctx;
    }

    getContext() {
        return this.context;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    once(event, callback) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        this.on(event, wrapper);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const filtered = this.listeners.get(event).filter((cb) => cb !== callback);
        this.listeners.set(event, filtered);
    }

    emit(event, data = {}) {
        const callbacks = this.listeners.get(event);
        if (!callbacks || callbacks.length === 0) {
            if (this.warnOnMissingListeners) {
                console.warn(`[EventSystem] No listeners for "${event}"`);
            }
            return;
        }
        const payload = this.context ? { ...this.context, ...data } : { ...data };
        callbacks.forEach((callback) => callback(payload));
    }
}

export const events = new EventSystem();

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
