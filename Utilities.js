export class Utilities {
    static distToSegment(px, py, vx, vy, wx, wy) {
        const l2 = (wx - vx) ** 2 + (wy - vy) ** 2;
        if (l2 === 0) return Math.hypot(px - vx, py - vy);
        let t = ((px - vx) * (wx - vx) + (py - vy) * (wy - vy)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (vx + t * (wx - vx)), py - (vy + t * (wy - vy)));
    }

    static getSegmentsAlongLine(x1, y1, x2, y2, flowFieldGrid) {
        const p1 = flowFieldGrid.worldToGrid(x1, y1);
        const p2 = flowFieldGrid.worldToGrid(x2, y2);
        
        const col0 = Math.max(0, Math.min(flowFieldGrid.cols - 1, p1.col));
        const row0 = Math.max(0, Math.min(flowFieldGrid.rows - 1, p1.row));
        const col1 = Math.max(0, Math.min(flowFieldGrid.cols - 1, p2.col));
        const row1 = Math.max(0, Math.min(flowFieldGrid.rows - 1, p2.row));
        
        const dcol = Math.abs(col1 - col0);
        const drow = Math.abs(row1 - row0);
        const scol = col0 < col1 ? 1 : -1;
        const srow = row0 < row1 ? 1 : -1;
        let err = dcol - drow;
        
        let c = col0;
        let r = row0;
        
        const result = [];
        const checked = new Set();
        
        while (true) {
            const idx = r * flowFieldGrid.cols + c;
            const cellSegs = flowFieldGrid.segmentGrid[idx];
            if (cellSegs) {
                for (let i = 0; i < cellSegs.length; i++) {
                    const seg = cellSegs[i];
                    if (!checked.has(seg)) {
                        checked.add(seg);
                        result.push(seg);
                    }
                }
            }
            
            if (c === col1 && r === row1) break;
            const e2 = 2 * err;
            if (e2 > -drow) {
                err -= drow;
                c += scol;
            }
            if (e2 < dcol) {
                err += dcol;
                r += srow;
            }
        }
        return result;
    }

    static hasLineOfSight(x1, y1, x2, y2, segments, padding = 0) {
        let candidateWalls = segments;
        if (segments && segments.flowFieldGrid) {
            candidateWalls = this.getSegmentsAlongLine(x1, y1, x2, y2, segments.flowFieldGrid);
        }

        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        for (const seg of candidateWalls) {
            if (seg.isDead) continue;
            const limit = seg.size * 0.5 + padding;
            if (seg.x < minX - limit || seg.x > maxX + limit ||
                seg.y < minY - limit || seg.y > maxY + limit) {
                continue;
            }
            const dist = this.distToSegment(seg.x, seg.y, x1, y1, x2, y2);
            if (dist < limit) {
                return false;
            }
        }
        return true;
    }

    static normalizeAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    static turnAngleTowards(currentAngle, targetAngle, turnSpeed, dt) {
        let diff = targetAngle - currentAngle;
        diff = this.normalizeAngle(diff);
        const t = Math.min(1, turnSpeed * (dt / 1000));
        return this.normalizeAngle(currentAngle + diff * t);
    }

    static normalizeVector(dx, dy) {
        const len = Math.hypot(dx, dy);
        if (len <= 0) {
            return { x: 0, y: 0, len: 0 };
        }
        return { x: dx / len, y: dy / len, len };
    }

    static setDesiredDirection(entity, dx, dy) {
        const vec = this.normalizeVector(dx, dy);
        entity.desiredX = vec.x;
        entity.desiredY = vec.y;
        return vec;
    }
}