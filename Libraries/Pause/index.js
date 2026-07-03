/**
 * Multi-reason pause gate — syncs a boolean onto a host state object.
 */
export class PauseManager {
    /**
     * @param {{ isPaused?: boolean }} state
     */
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
