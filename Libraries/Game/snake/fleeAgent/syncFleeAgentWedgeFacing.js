import { invalidateBroadphaseBounds } from "../../../Spatial/collision/entityBroadphase.js";
import { wakeKineticBody } from "../../../Motion/kineticSleep.js";
const MIN_FACING_SPEED = 2;
export function fleeAgentWedgeFacingFromHeading(heading) {
    return heading - Math.PI / 2;
}
export function resolveFleeAgentBodyHeading(body) {
    const speed = Math.hypot(body.vx, body.vy);
    if (speed >= MIN_FACING_SPEED) return Math.atan2(body.vy, body.vx);
    const drive = body._groundRollDrive;
    if (drive?.kind === "thrust" && Number.isFinite(drive.dirX) && Number.isFinite(drive.dirY)) return Math.atan2(drive.dirY, drive.dirX);
    return null;
}
export function syncFleeAgentWedgeFacing(body, wedge, heading = null) {
    const resolvedHeading = heading ?? resolveFleeAgentBodyHeading(body);
    if (resolvedHeading == null) return false;
    const facing = fleeAgentWedgeFacingFromHeading(resolvedHeading);
    if (Math.abs((wedge.facing ?? 0) - facing) < 1e-4) return false;
    wedge.facing = facing;
    wedge.angularVelocity = 0;
    wedge.stateTimer = (wedge.stateTimer ?? 0) + 1;
    invalidateBroadphaseBounds(wedge);
    wakeKineticBody(wedge);
    return true;
}
