const SCRATCH_POSE = { x: 0, y: 0, vx: 0, vy: 0, desiredX: 0, desiredY: 0, radius: 8 };
export function agentPose(source) {
    SCRATCH_POSE.x = source.x;
    SCRATCH_POSE.y = source.y;
    SCRATCH_POSE.vx = source.vx ?? 0;
    SCRATCH_POSE.vy = source.vy ?? 0;
    SCRATCH_POSE.desiredX = source.desiredX ?? 0;
    SCRATCH_POSE.desiredY = source.desiredY ?? 0;
    SCRATCH_POSE.radius = source.radius ?? 8;
    return SCRATCH_POSE;
}
