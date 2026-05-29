import { Events } from "./EventNames.js";

export class PauseManager {
    constructor(state) {
        this.state = state;
        this.reasons = new Set();
    }

    pause(reason) {
        this.reasons.add(reason);
        this.syncState();
    }

    resume(reason) {
        this.reasons.delete(reason);
        this.syncState();
    }

    toggleUser() {
        if (this.reasons.has("user")) {
            this.resume("user");
        } else {
            this.pause("user");
        }
    }

    reset() {
        this.reasons.clear();
        this.syncState();
    }

    syncState() {
        this.state.isPaused = this.reasons.size > 0;
    }
}

export function registerPauseListeners(eventBus, pauseManager) {
    eventBus.on(Events.GAME_PAUSE, ({ reason }) => pauseManager.pause(reason));
    eventBus.on(Events.GAME_RESUME, ({ reason }) => pauseManager.resume(reason));
    eventBus.on(Events.GAME_TOGGLE_PAUSE, () => pauseManager.toggleUser());
}
