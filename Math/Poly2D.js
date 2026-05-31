/** Rotate local offset (lx, ly) around origin and translate to (centerX, centerY). */
export function rotatePoint(centerX, centerY, lx, ly, angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
        x: centerX + lx * cos - ly * sin,
        y: centerY + lx * sin + ly * cos,
    };
}

export function rectCorners(centerX, centerY, halfSize, angle = 0) {
    const local = [
        { lx: -halfSize, ly: -halfSize },
        { lx: halfSize, ly: -halfSize },
        { lx: halfSize, ly: halfSize },
        { lx: -halfSize, ly: halfSize },
    ];
    return local.map(({ lx, ly }) => rotatePoint(centerX, centerY, lx, ly, angle));
}
