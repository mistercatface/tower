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

export { Events } from "./EventNames.js";
