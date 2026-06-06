export function normalizeAngle(angle) {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    else if (a <= -Math.PI) a += Math.PI * 2;
    return a;
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

/** Blend two angles along the shortest arc (radians). */
export function blendAngle(from, to, t) {
    return from + angleDelta(from, to) * t;
}

/** Map angle to [0, 2π). */
export function positiveAngle(angle) {
    let r = (angle ?? 0) % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    return r;
}

/** Bucket index in [0, steps) for angle quantization. */
export function quantizeAngleIndex(angle, steps) {
    if (steps <= 0) return 0;
    const step = (Math.PI * 2) / steps;
    return Math.floor(positiveAngle(angle) / step);
}

/** Snap angle to bucket start in [0, 2π). */
export function quantizeAngle(angle, steps) {
    if (steps <= 0) return positiveAngle(angle);
    const step = (Math.PI * 2) / steps;
    return quantizeAngleIndex(angle, steps) * step;
}
