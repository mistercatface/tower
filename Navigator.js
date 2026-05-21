export class Navigator {
    static getFlowFieldDirection(col, row, gridSystem, targetField) {
        if (col < 0 || col >= gridSystem.cols || row < 0 || row >= gridSystem.rows) return null;
        let flow = targetField[row * gridSystem.cols + col];

        if (!flow) {
            let bestDist = Infinity;
            for (let r = -2; r <= 2; r++) {
                for (let c = -2; c <= 2; c++) {
                    const nc = col + c;
                    const nr = row + r;
                    if (nc >= 0 && nc < gridSystem.cols && nr >= 0 && nr < gridSystem.rows) {
                        const nFlow = targetField[nr * gridSystem.cols + nc];
                        if (nFlow) {
                            const dist = Math.hypot(c, r);
                            if (dist < bestDist) {
                                bestDist = dist;
                                flow = nFlow;
                            }
                        }
                    }
                }
            }
        }
        return flow;
    }

    static getSteeringAngle(x, y, gridSystem, targetField) {
        const { col, row } = gridSystem.worldToGrid(x, y);
        const flow = this.getFlowFieldDirection(col, row, gridSystem, targetField);

        if (flow && (flow.x !== 0 || flow.y !== 0)) {
            const cx = col * gridSystem.cellSize + gridSystem.centerX - gridSystem.offsetX + (gridSystem.cellSize / 2);
            const cy = row * gridSystem.cellSize + gridSystem.centerY - gridSystem.offsetY + (gridSystem.cellSize / 2);

            const len = Math.hypot(flow.x, flow.y);
            const fx = flow.x / len;
            const fy = flow.y / len;

            const dx = x - cx;
            const dy = y - cy;
            const t = dx * fx + dy * fy;

            const targetX = (cx + fx * t) + fx * 10.0;
            const targetY = (cy + fy * t) + fy * 10.0;

            return Math.atan2(targetY - y, targetX - x);
        }
        return null;
    }
}