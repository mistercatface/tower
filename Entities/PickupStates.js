export class PickupNormalState {
    getRender3DKey(pickup) {
        return pickup.strategy.render3DKey;
    }
}
export const pickupStates = { normal: new PickupNormalState() };
/** @param {Record<string, object>} states */
export function registerPickupStates(states) {
    for (const key of Object.keys(pickupStates)) if (key !== "normal") delete pickupStates[key];
    Object.assign(pickupStates, states);
}
