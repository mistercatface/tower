/** @param {object[]} events @param {object} ctx */
export function dispatchSimulationEvents(events, ctx) {
    for (const event of events) if (event.target?.handleHit) event.target.handleHit(event.damage, ctx, event.type, event);
}
