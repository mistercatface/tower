/**
 * Debounced callback on a game Scheduler (coalesces rapid triggers into one delayed run).
 *
 * @param {import("./Scheduler.js").Scheduler} scheduler
 * @param {number} delayMs
 * @param {() => void} action
 */
export function createDebouncedAction(scheduler, delayMs, action) {
    let eventId = null;

    return {
        queue() {
            if (eventId !== null) {
                scheduler.cancel(eventId);
            }
            eventId = scheduler.schedule(delayMs, () => {
                eventId = null;
                action();
            });
        },

        cancel() {
            if (eventId !== null) {
                scheduler.cancel(eventId);
                eventId = null;
            }
        },
    };
}
