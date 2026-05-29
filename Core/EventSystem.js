class EventSystem {
    constructor() {
        this.listeners = new Map();
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

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach((callback) => callback(data));
    }
}

export const events = new EventSystem();
