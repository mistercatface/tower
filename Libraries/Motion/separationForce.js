/** Pure circle separation: steer bias + positional push from one neighbor pair. */
/**
 * @returns {{ x: number, y: number, pushX: number, pushY: number }}
 */
export function createSeparationAccum() {
    return { x: 0, y: 0, pushX: 0, pushY: 0 };
}
/**
 * @param {{ x: number, y: number, pushX: number, pushY: number }} acc
 * @param {number} selfX
 * @param {number} selfY
 * @param {number} selfRadius
 * @param {number} otherX
 * @param {number} otherY
 * @param {number} otherRadius
 * @param {number} neighborPad
 */
export function accumulateSeparationFromPair(acc, selfX, selfY, selfRadius, otherX, otherY, otherRadius, neighborPad) {
    let dx = selfX - otherX;
    let dy = selfY - otherY;
    let distSq = dx * dx + dy * dy;
    const avoidRadius = selfRadius + otherRadius + neighborPad;
    if (distSq >= avoidRadius * avoidRadius) return;
    let dist = Math.sqrt(distSq);
    if (dist === 0) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        distSq = dx * dx + dy * dy;
        dist = Math.sqrt(distSq);
    } else if (dist < selfRadius + otherRadius + 5) {
        dx += (Math.random() - 0.5) * 0.5;
        dy += (Math.random() - 0.5) * 0.5;
        distSq = dx * dx + dy * dy;
        dist = Math.sqrt(distSq);
    }
    if (dist < avoidRadius) {
        const weight = 1 - dist / avoidRadius;
        acc.x += (dx / dist) * weight;
        acc.y += (dy / dist) * weight;
    }
    const minSep = selfRadius + otherRadius + 0.1;
    if (dist < minSep) {
        const overlap = minSep - dist;
        acc.pushX += (dx / dist) * overlap * 0.5;
        acc.pushY += (dy / dist) * overlap * 0.5;
    }
}
/**
 * @param {{ x: number, y: number, pushX: number, pushY: number }} acc
 * @param {{ steerCap?: number, pushCap?: number }} [limits]
 */
export function clampSeparationAccum(acc, { steerCap = 1.0, pushCap = 3.0 } = {}) {
    let sepLen = Math.hypot(acc.x, acc.y);
    if (sepLen > steerCap) {
        acc.x = (acc.x / sepLen) * steerCap;
        acc.y = (acc.y / sepLen) * steerCap;
    }
    let pushLen = Math.hypot(acc.pushX, acc.pushY);
    if (pushLen > pushCap) {
        acc.pushX = (acc.pushX / pushLen) * pushCap;
        acc.pushY = (acc.pushY / pushLen) * pushCap;
    }
    return acc;
}
