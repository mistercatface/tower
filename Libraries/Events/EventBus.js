/**
 * Generic pub/sub event bus with optional shared emit context.
 */
export class EventBus {
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
        if (!this.listeners.has(event)) this.listeners.set(event, []);
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
            if (this.warnOnMissingListeners) console.warn(`[EventBus] No listeners for "${event}"`);
            return;
        }
        const payload = this.context ? { ...this.context, ...data } : { ...data };
        callbacks.forEach((callback) => callback(payload));
    }
}
