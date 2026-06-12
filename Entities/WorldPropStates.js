export class WorldPropNormalState {
    getRender3DKey(prop) {
        return prop.strategy.render3DKey;
    }
}
export const worldPropStates = { normal: new WorldPropNormalState() };
