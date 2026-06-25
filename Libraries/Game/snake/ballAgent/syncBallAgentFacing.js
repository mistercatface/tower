import { angleDelta, normalizeAngle } from "../../../Math/Angle.js";
export const DEFAULT_BALL_FACING_TURN_RAD_PER_SEC = Math.PI * 1.5;
const HEADING_SPEED_MIN = 0.25;
export function rotateAngleTowards(from, to, maxStep) {
    const diff = angleDelta(from, to);
    if (Math.abs(diff) <= maxStep) return normalizeAngle(to);
    return normalizeAngle(from + Math.sign(diff) * maxStep);
}
export function shouldSyncBallAgentFacingToVelocity(combatAction) {
    return combatAction?.phase !== "charging";
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
