const STORAGE_KEY = "tower_persistent_triggers_v1";

/**
 * One-shot triggers that survive browser sessions (localStorage).
 * Separate from the pub/sub EventSystem — register here, then bridge game events in PersistentTriggerSetup.
 */
class PersistentTriggers {
    constructor() {
        /** @type {Set<string>} */
        this.fired = new Set();
        /** @type {Map<string, Array<{ id: string, condition: (data: object) => boolean, action: (data: object) => void }>>} */
        this.listeners = new Map();
    }

    load() {
        this.fired.clear();
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const ids = JSON.parse(raw);
            if (Array.isArray(ids)) {
                for (const id of ids) {
                    if (typeof id === "string") this.fired.add(id);
                }
            }
        } catch (error) {
            console.warn("[PersistentTriggers] Failed to load:", error);
        }
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.fired]));
        } catch (error) {
            console.warn("[PersistentTriggers] Failed to save:", error);
        }
    }

    clear() {
        this.fired.clear();
        this.listeners.clear();
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (_error) {
            // Ignore quota / private mode.
        }
    }

    hasFired(id) {
        return this.fired.has(id);
    }

    /**
     * @param {string} event
     * @param {string} id Stable id — never fires again once saved.
     * @param {(data: object) => boolean} [condition]
     * @param {(data: object) => void} action
     */
    on(event, id, condition = () => true, action) {
        if (this.fired.has(id)) return;
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push({ id, condition, action });
    }

    /**
     * Check pending triggers for this event. Fired ids are removed from the listener list and persisted.
     * @param {string} event
     * @param {object} [data]
     */
    emit(event, data = {}) {
        const list = this.listeners.get(event);
        if (!list || list.length === 0) return;

        let changed = false;
        for (let i = list.length - 1; i >= 0; i--) {
            const entry = list[i];
            if (!entry.condition(data)) continue;
            entry.action(data);
            this.fired.add(entry.id);
            list.splice(i, 1);
            changed = true;
        }

        if (changed) this.save();
    }
}

export const persistentTriggers = new PersistentTriggers();

export function loadPersistentTriggers() {
    persistentTriggers.load();
}

export function clearPersistentTriggers() {
    persistentTriggers.clear();
}
