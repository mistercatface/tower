export function normalizeAngle(angle) {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Shortest signed delta from `from` to `to`. */
export function angleDelta(from, to) {
    let delta = to - from;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;
    return delta;
}

export function turnAngleTowards(currentAngle, targetAngle, turnSpeed, dt) {
    const diff = normalizeAngle(targetAngle - currentAngle);
    const t = Math.min(1, turnSpeed * (dt / 1000));
    return normalizeAngle(currentAngle + diff * t);
}
