export class Scheduler {
    constructor() {
        this.events = [];
        this.nextId = 1;
    }

    schedule(delay, callback, isLoop = false) {
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
        for (let i = this.events.length - 1; i >= 0; i--) {
            const event = this.events[i];
            
            if (event.remove) {
                this.events.splice(i, 1);
                continue;
            }
            
            if (event.paused) continue;

            event.timer -= dt;
            
            if (event.timer <= 0) {
                event.callback();
                if (event.isLoop) {
                    event.timer += event.delay;
                } else {
                    this.events.splice(i, 1);
                }
            }
        }
    }
}