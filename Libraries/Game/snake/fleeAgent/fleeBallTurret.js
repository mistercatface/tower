import { blendAngle } from "../../../Math/Angle.js";
import { quantizeAngleIndex } from "../../../Canvas/viewQuantize.js";
import { resolvePropQuantizeSteps } from "../../../Props/propStrategy.js";
const FLEE_BALL_TURRET_SLEW = 24;
export function resolveFleeBallTurretTarget(head) {
    const drive = head._groundRollDrive;
    if (drive?.kind === "thrust") {
        const len = Math.hypot(drive.dirX, drive.dirY);
        if (len > 1e-6) return Math.atan2(drive.dirY, drive.dirX);
    }
    const speed = Math.hypot(head.vx, head.vy);
    if (speed > 1e-6) return Math.atan2(head.vy, head.vx);
    return null;
}
export function syncFleeBallTurretFacing(head, dtMs) {
    if (head.type !== "flee_ball") return;
    const target = resolveFleeBallTurretTarget(head);
    if (target == null) return;
    const current = head.turretFacing ?? target;
    const t = Math.min(1, (dtMs / 1000) * FLEE_BALL_TURRET_SLEW);
    const next = blendAngle(current, target, t);
    if (Math.abs(next - current) < 1e-5) return;
    const steps = resolvePropQuantizeSteps(head).facing;
    const prevBucket = quantizeAngleIndex(current, steps);
    head.turretFacing = next;
    if (quantizeAngleIndex(next, steps) !== prevBucket) head.stateTimer = (head.stateTimer ?? 0) + 1;
}
