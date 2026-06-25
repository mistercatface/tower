import { getAgentProfile } from "../../../AI/agents/agentProfile.js";
import { getInstanceCombatTraits, isBallCombatTopology } from "../agentCombatTraits.js";
import { resolveRangedWeapon } from "../rangedCombat/resolveRangedWeapon.js";
import { DEFAULT_BALL_FACING_TURN_RAD_PER_SEC, shouldSyncBallAgentFacingToVelocity, syncBallAgentFacingToVelocity } from "./syncBallAgentFacing.js";
export function syncBallAgentFacingAfterPhysics(instance, dtMs) {
    if (!instance || !isBallCombatTopology(getInstanceCombatTraits(instance))) return;
    if (!shouldSyncBallAgentFacingToVelocity(instance.combatAction)) return;
    const profile = getAgentProfile(instance.profileId);
    const weapon = resolveRangedWeapon(instance, profile);
    const turnRadPerSec = weapon?.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
    syncBallAgentFacingToVelocity(instance.head, dtMs, turnRadPerSec);
}
