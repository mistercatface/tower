export const blend = (a, b, t) => a + (b - a) * t;

export const ease = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function getSeg(sx, sy, sz, angle, angleZ, len, flare) {
    const rawSin = Math.sin(angle);
    const rawCos = Math.cos(angle);
    const y = sy + rawCos * len;
    const hMag = rawSin * len;
    const x = sx + Math.cos(angleZ) * hMag;
    const z = sz + Math.sin(angleZ) * hMag + flare;
    return { x, y, z };
}

export function solveIK(startX, startY, targetX, targetY, len1, len2) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxReach = len1 + len2;
    const minReach = Math.abs(len1 - len2);
    const clampedDist = Math.max(minReach, Math.min(maxReach, dist));
    const angleToTarget = Math.atan2(dx, dy);
    const cosHip = (len1 * len1 + clampedDist * clampedDist - len2 * len2) / (2 * len1 * clampedDist);
    const hipBend = Math.acos(Math.max(-1, Math.min(1, cosHip)));
    const cosKnee = (len1 * len1 + len2 * len2 - clampedDist * clampedDist) / (2 * len1 * len2);
    const kneeBend = Math.acos(Math.max(-1, Math.min(1, cosKnee)));
    return {
        hipAngle: angleToTarget - hipBend,
        kneeAngle: Math.PI - kneeBend,
    };
}

export function applyLocalTilt(p, angle, anchorY) {
    const pyShifted = p.y - anchorY;
    const tCos = Math.cos(angle);
    const tSin = Math.sin(angle);
    return {
        x: p.x * tCos + pyShifted * tSin,
        y: -p.x * tSin + pyShifted * tCos + anchorY,
        z: p.z,
    };
}
