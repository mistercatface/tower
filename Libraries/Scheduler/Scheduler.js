export class Scheduler {
    constructor() {
        this.events = new Map();
        this.nextId = 1;
    }
    schedule(delay, callback = null, isLoop = false) {
        const id = this.nextId++;
        const safeDelay = delay > 0 ? delay : 1;
        const event = { id, timer: safeDelay, delay: safeDelay, callback, isLoop, paused: false };
        this.events.set(id, event);
        return id;
    }
    cancel(id) {
        this.events.delete(id);
    }
    pause(id) {
        const event = this.events.get(id);
        if (event) event.paused = true;
    }
    resume(id) {
        const event = this.events.get(id);
        if (event) event.paused = false;
    }
    getTimeRemaining(id) {
        const event = this.events.get(id);
        return event ? event.timer : 0;
    }
    clear() {
        this.events.clear();
    }
    update(dt) {
        for (const [id, event] of this.events) {
            if (event.paused) continue;
            event.timer -= dt;
            if (event.timer <= 0)
                if (event.isLoop)
                    while (event.timer <= 0 && this.events.has(id)) {
                        if (event.callback) event.callback();
                        event.timer += event.delay;
                    }
                else {
                    if (event.callback) event.callback();
                    this.events.delete(id);
                }
        }
    }
}
