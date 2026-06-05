/**
 * One-shot triggers persisted to localStorage (browser sessions).
 */
export class PersistentTriggers {
    /**
     * @param {string} [storageKey]
     */
    constructor(storageKey = "tower_persistent_triggers_v1") {
        this.storageKey = storageKey;
        /** @type {Set<string>} */
        this.fired = new Set();
        /** @type {Map<string, Array<{ id: string, condition: (data: object) => boolean, action: (data: object) => void }>>} */
        this.listeners = new Map();
    }

    load() {
        this.fired.clear();
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return;
            const ids = JSON.parse(raw);
            if (Array.isArray(ids)) {
                for (let i = 0; i < ids.length; i++) {
                    const id = ids[i];
                    if (typeof id === "string") this.fired.add(id);
                }
            }
        } catch (error) {
            console.warn("[PersistentTriggers] Failed to load:", error);
        }
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify([...this.fired]));
        } catch (error) {
            console.warn("[PersistentTriggers] Failed to save:", error);
        }
    }

    clear() {
        this.fired.clear();
        this.listeners.clear();
        try {
            localStorage.removeItem(this.storageKey);
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
