export class Scheduler {
    constructor() {
        this.events = [];
        this.nextId = 1;
    }

    schedule(delay, callback = null, isLoop = false) {
        const id = this.nextId++;
        this.events.push({ id, timer: delay, delay, callback, isLoop, remove: false, paused: false });
        return id;
    }

    cancel(id) {
        const event = this.events.find((e) => e.id === id);
        if (event) event.remove = true;
    }

    pause(id) {
        const event = this.events.find((e) => e.id === id);
        if (event) event.paused = true;
    }

    resume(id) {
        const event = this.events.find((e) => e.id === id);
        if (event) event.paused = false;
    }

    getTimeRemaining(id) {
        const event = this.events.find((e) => e.id === id);
        return event && !event.remove ? event.timer : 0;
    }

    clear() {
        this.events = [];
    }

    update(dt) {
        let hasRemovals = false;

        for (let i = 0; i < this.events.length; i++) {
            const event = this.events[i];

            if (event.remove) {
                hasRemovals = true;
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
                    hasRemovals = true;
                }
            }
        }

        if (hasRemovals) {
            this.events = this.events.filter((e) => !e.remove);
        }
    }
}