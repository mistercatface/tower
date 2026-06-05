export class Scheduler {
    constructor() {
        this.events = new Map();
        this.nextId = 1;
    }

    schedule(delay, callback = null, isLoop = false) {
        const id = this.nextId++;
        const event = { id, timer: delay, delay, callback, isLoop, remove: false, paused: false };
        this.events.set(id, event);
        return id;
    }

    cancel(id) {
        const event = this.events.get(id);
        if (event) event.remove = true;
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
        return event && !event.remove ? event.timer : 0;
    }

    clear() {
        this.events.clear();
    }

    update(dt) {
        for (const [id, event] of this.events) {
            if (event.remove) {
                this.events.delete(id);
                continue;
            }

            if (event.paused) continue;

            event.timer -= dt;

            if (event.timer <= 0) {
                if (event.isLoop) {
                    while (event.timer <= 0) {
                        if (event.callback) event.callback();
                        event.timer += event.delay;
                    }
                } else {
                    if (event.callback) event.callback();
                    event.remove = true;
                }
            }
        }
    }
}
