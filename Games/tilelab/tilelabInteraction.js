import { mergePairFilter } from "../../Libraries/Interaction/pairRules.js";
import { excludeDeadOther, excludeActorOther, requirePickupOnHit } from "../../Libraries/Interaction/pairRuleClauses.js";
const SANDBOX_PROJECTILE_HIT_PICKUP = mergePairFilter(excludeDeadOther, excludeActorOther, requirePickupOnHit);
export const tilelabInteractionPairs = { projectileHitPickup: SANDBOX_PROJECTILE_HIT_PICKUP };
