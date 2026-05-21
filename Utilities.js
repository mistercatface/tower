export class Utilities {
    static distToSegment(px, py, vx, vy, wx, wy) {
        const l2 = (wx - vx) ** 2 + (wy - vy) ** 2;
        if (l2 === 0) return Math.hypot(px - vx, py - vy);
        let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (vx + t * (wx - vx)), py - (vy + t * (wy - vy)));
    }

    static hasLineOfSight(x1, y1, x2, y2, walls, padding = 0) {
        for (const wall of walls) {
            for (const seg of wall.segments) {
                if (seg.isDead) continue;
                const dist = this.distToSegment(seg.x, seg.y, x1, y1, x2, y2);
                if (dist < seg.size * 0.5 + padding) {
                    return false;
                }
            }
        }
        return true;
    }

    static normalizeAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }
}