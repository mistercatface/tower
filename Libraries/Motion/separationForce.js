import { normalizeXY, speedSqXY } from "../Math/Vec2.js";
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
    const avoidRadius = selfRadius + otherRadius + neighborPad;
    if (speedSqXY(dx, dy) >= avoidRadius * avoidRadius) return;
    let { nx, ny, len: dist } = normalizeXY(dx, dy);
    if (dist === 0) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        ({ nx, ny, len: dist } = normalizeXY(dx, dy));
    } else if (dist < selfRadius + otherRadius + 5) {
        dx += (Math.random() - 0.5) * 0.5;
        dy += (Math.random() - 0.5) * 0.5;
        ({ nx, ny, len: dist } = normalizeXY(dx, dy));
    }
    if (dist < avoidRadius) {
        const weight = 1 - dist / avoidRadius;
        acc.x += nx * weight;
        acc.y += ny * weight;
    }
    const minSep = selfRadius + otherRadius + 0.1;
    if (dist < minSep) {
        const overlap = minSep - dist;
        acc.pushX += nx * overlap * 0.5;
        acc.pushY += ny * overlap * 0.5;
    }
}
/**
 * @param {{ x: number, y: number, pushX: number, pushY: number }} acc
 * @param {{ steerCap?: number, pushCap?: number }} [limits]
 */
export function clampSeparationAccum(acc, { steerCap = 1.0, pushCap = 3.0 } = {}) {
    let { nx, ny, len: sepLen } = normalizeXY(acc.x, acc.y);
    if (sepLen > steerCap) {
        acc.x = nx * steerCap;
        acc.y = ny * steerCap;
    }
    let { nx: pnx, ny: pny, len: pushLen } = normalizeXY(acc.pushX, acc.pushY);
    if (pushLen > pushCap) {
        acc.pushX = pnx * pushCap;
        acc.pushY = pny * pushCap;
    }
    return acc;
}
