import { isPairActive, shouldResolveActorPushable, shouldResolvePushablePair } from "../Spatial/collision/entityBroadphase.js";

export const spatialPairResolvers = {
    actorPushable: shouldResolveActorPushable,
    pairActive: isPairActive,
    pushablePair: shouldResolvePushablePair,
};
