import { isPairActive, shouldResolvePushablePair } from "../Spatial/collision/entityBroadphase.js";
export const spatialPairResolvers = { pairActive: isPairActive, pushablePair: shouldResolvePushablePair };
