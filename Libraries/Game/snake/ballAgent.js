import { angleDelta, normalizeAngle, rotateAngleTowards } from "../../Math/Angle.js";
import { getAgentProfile } from "../../AI/agents/agentProfile.js";
import { isBallCombatTopology } from "./agentCombatTraits.js";
import { resolveRangedWeapon } from "./rangedCombat.js";
import { clearPropVisualOverride, getPropVisualTint, setPropVisualTint } from "../../Color/visualOverride.js";
export const DEFAULT_BALL_FACING_TURN_RAD_PER_SEC = Math.PI * 1.5;
const HEADING_SPEED_MIN = 0.25;
export function shouldSyncBallAgentFacingToVelocity(combatAction) {
    const phase = combatAction?.phase;
    return phase !== "reacting" && phase !== "fire_delay" && phase !== "reloading";
}
export function syncBallAgentFacingToVelocity(head, dtMs, turnRadPerSec = DEFAULT_BALL_FACING_TURN_RAD_PER_SEC) {
    const vx = head.vx ?? 0;
    const vy = head.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < HEADING_SPEED_MIN) return;
    const moveAngle = Math.atan2(vy, vx);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    head.facing = rotateAngleTowards(head.facing ?? moveAngle, moveAngle, maxStep);
}
export function syncBallAgentFacingToTarget(head, target, dtMs, turnRadPerSec = DEFAULT_BALL_FACING_TURN_RAD_PER_SEC) {
    if (!target || target.isDead) return head.facing ?? 0;
    const targetAngle = Math.atan2(target.y - head.y, target.x - head.x);
    const maxStep = turnRadPerSec * (dtMs / 1000);
    head.facing = rotateAngleTowards(head.facing ?? targetAngle, targetAngle, maxStep);
    return head.facing;
}
export function syncBallAgentFacingAfterPhysics(instance, dtMs) {
    if (!instance || !isBallCombatTopology(instance.combatTraits)) return;
    if (!shouldSyncBallAgentFacingToVelocity(instance.combatAction)) return;
    const profile = getAgentProfile(instance.profileId);
    const weapon = resolveRangedWeapon(instance, profile);
    const turnRadPerSec = weapon?.aimRotationRadPerSec ?? DEFAULT_BALL_FACING_TURN_RAD_PER_SEC;
    syncBallAgentFacingToVelocity(instance.head, dtMs, turnRadPerSec);
}
export function syncBallAgentPresentation(prop, { baseTint }) {
    const wantTint = baseTint;
    const current = getPropVisualTint(prop);
    if (wantTint) {
        if (current === wantTint) return;
        setPropVisualTint(prop, wantTint);
        return;
    }
    if (!prop.visualOverride?.tint) return;
    clearPropVisualOverride(prop);
}
