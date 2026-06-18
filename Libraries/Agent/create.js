export function agentPose(source) {
    return {
        x: source.x,
        y: source.y,
        vx: source.vx ?? 0,
        vy: source.vy ?? 0,
        desiredX: source.desiredX ?? 0,
        desiredY: source.desiredY ?? 0,
        radius: source.radius ?? 8,
    };
}
