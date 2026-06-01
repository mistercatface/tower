import { angleDelta } from "../../Math/Angle.js";

export const blend = (a, b, t) => a + (b - a) * t;

/** Blend two angles along the shortest arc (radians). */
export const blendAngle = (a, b, t) => a + angleDelta(a, b) * t;

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

export function getRelativeAimAngle(diveDir, aimAngle) {
    return angleDelta(diveDir, aimAngle);
}

/** Aim rig arms toward world angle; whichArms: 'left' | 'right' | 'both'. */
export function getAimingArmAngles(aimAngle, whichArms = "right", extension = -1.5, diveDir = 0) {
    const relAim = getRelativeAimAngle(diveDir, aimAngle);
    let rArm;
    let lArm;
    let rElbow;
    let lElbow;
    let rArmZ = 0;
    let lArmZ = 0;

    if (whichArms === "both") {
        rArm = -Math.PI / 2;
        lArm = -Math.PI / 2;
        rElbow = extension;
        lElbow = extension;
        const handConvergence = 0.35;
        rArmZ = relAim + handConvergence;
        lArmZ = -(relAim - handConvergence);
    } else if (whichArms === "left") {
        lArm = -Math.PI / 2;
        lElbow = extension;
        lArmZ = -relAim;
        rArm = 0.1;
        rElbow = -0.2;
        rArmZ = 0;
    } else {
        rArm = -Math.PI / 2;
        rElbow = extension;
        rArmZ = relAim;
        lArm = 0.1;
        lElbow = -0.2;
        lArmZ = 0;
    }

    return {
        rArm,
        lArm,
        rElbow,
        lElbow,
        rArmZ,
        lArmZ,
        rElbowZ: 0,
        lElbowZ: 0,
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
