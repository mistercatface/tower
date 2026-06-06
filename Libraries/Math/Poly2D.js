/** Rotate local offset (lx, ly) around origin and translate to (centerX, centerY). */
export function rotatePoint(centerX, centerY, lx, ly, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: centerX + lx * cos - ly * sin, y: centerY + lx * sin + ly * cos };
}
export function rectCorners(centerX, centerY, halfSize, angle = 0) {
    const hx = typeof halfSize === "number" ? halfSize : (halfSize.x ?? halfSize.hx);
    const hy = typeof halfSize === "number" ? halfSize : (halfSize.y ?? halfSize.hy);
    const local = [
        { lx: -hx, ly: -hy },
        { lx: hx, ly: -hy },
        { lx: hx, ly: hy },
        { lx: -hx, ly: hy },
    ];
    return local.map(({ lx, ly }) => rotatePoint(centerX, centerY, lx, ly, angle));
}
