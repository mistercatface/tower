import { quantizeAngle, quantizeAngleIndex } from "../Math/Angle.js";
import { clamp } from "../Math/Interpolate.js";
/** Quantize viewer-relative world offset for sprite cache keys (matches kinematics tilt buckets). */
export function quantizeViewOffset(dx, dy, step = 30, limit = 120) {
    const clampedDx = clamp(dx, -limit, limit);
    const clampedDy = clamp(dy, -limit, limit);
    return { dx: Math.round(clampedDx / step) * step, dy: Math.round(clampedDy / step) * step, keyDx: Math.round(clampedDx / step), keyDy: Math.round(clampedDy / step) };
}
export { quantizeAngle, quantizeAngleIndex };
