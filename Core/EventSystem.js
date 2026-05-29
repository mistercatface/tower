import { Events } from "./EventNames.js";

class EventSystem {
    constructor() {
        this.listeners = new Map();
        this.context = null;
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

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const filtered = this.listeners.get(event).filter((cb) => cb !== callback);
        this.listeners.set(event, filtered);
    }

    emit(event, data = {}) {
        if (!this.listeners.has(event)) return;
        const payload = this.context ? { ...this.context, ...data } : { ...data };
        this.listeners.get(event).forEach((callback) => callback(payload));
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

export { Events } from "./EventNames.js";
