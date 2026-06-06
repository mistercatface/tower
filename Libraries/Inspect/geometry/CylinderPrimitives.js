import { vec3 } from "../../Math/Vec3.js";
import { lerp } from "../../Math/Interpolate.js";
export function cylinderPoint(y, angle, radius) {
    return vec3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}
export function bodyRadiusAtY(y, halfHeight, bodyRadius, rings) {
    if (!rings?.length) return bodyRadius;
    const sorted = [...rings].sort((a, b) => a.y - b.y);
    if (y <= sorted[0].y) return sorted[0].radius;
    if (y >= sorted[sorted.length - 1].y) return sorted[sorted.length - 1].radius;
    for (let i = 0; i < sorted.length - 1; i++) {
        const lo = sorted[i];
        const hi = sorted[i + 1];
        if (y >= lo.y && y <= hi.y) {
            const t = (y - lo.y) / (hi.y - lo.y);
            return lerp(lo.radius, hi.radius, t);
        }
    }
    return bodyRadius;
}
