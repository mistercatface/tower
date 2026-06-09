export class PickupNormalState {
    getRender3DKey(pickup) {
        return pickup.strategy.render3DKey;
    }
}
export const pickupStates = { normal: new PickupNormalState() };
